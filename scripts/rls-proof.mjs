// Proves the Week 1 isolation claim: two signed-in accounts cannot read each
// other's rows. Also proves the handle_new_user() trigger fires on signup.
//
// Plain fetch, no supabase-js: this exercises the same PostgREST + GoTrue HTTP
// surface the app uses, and avoids supabase-js constructing a RealtimeClient
// (which throws on Node < 22).
//
//   npx supabase start
//   SUPABASE_URL=... SERVICE_ROLE_KEY=... ANON_KEY=... node scripts/rls-proof.mjs

const URL_BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const ANON_KEY = process.env.ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Set SERVICE_ROLE_KEY and ANON_KEY (see `npx supabase status`).');
  process.exit(1);
}

const PASSWORD = 'proof-password-9f2a';
const failures = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
  if (!ok) failures.push(label);
}

async function api(path, { method = 'GET', key, token, body, prefer } = {}) {
  const response = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

const admin = (path, options = {}) => api(path, { ...options, key: SERVICE_ROLE_KEY });

async function createUser(email) {
  const user = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true },
  });
  return user.id;
}

async function signIn(email) {
  const session = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    key: ANON_KEY,
    body: { email, password: PASSWORD },
  });
  return session.access_token;
}

const asUser = (token, path) => api(path, { key: ANON_KEY, token });

// Unique per run so the script is re-runnable against the same database.
const stamp = process.hrtime.bigint().toString(36);
const emailA = `rls-a-${stamp}@example.com`;
const emailB = `rls-b-${stamp}@example.com`;

console.log('\nSignup trigger');
const idA = await createUser(emailA);
const idB = await createUser(emailB);

const profilesA = await admin(`/rest/v1/profiles?id=eq.${idA}&select=id`);
const profilesB = await admin(`/rest/v1/profiles?id=eq.${idB}&select=id`);
check('handle_new_user() created a profile for A', profilesA.length, 1);
check('handle_new_user() created a profile for B', profilesB.length, 1);

// Seed one job, one match and one audit row, all owned by A. service_role
// bypasses RLS, which is how the Edge Functions will write these.
const [job] = await admin('/rest/v1/jobs', {
  method: 'POST',
  prefer: 'return=representation',
  body: { posted_by: idA, title: 'ML Engineer', company: 'Acme', description: 'Retrieval systems.' },
});
await admin('/rest/v1/matches', {
  method: 'POST',
  body: { profile_id: idA, job_id: job.id, score: 0.812 },
});
await admin('/rest/v1/match_audit', {
  method: 'POST',
  body: { profile_id: idA, job_id: job.id, score: 0.812, cohort_visa: 'transferable' },
});

const tokenA = await signIn(emailA);
const tokenB = await signIn(emailB);

console.log('\nprofiles — own row only');
check('A sees exactly one profile', (await asUser(tokenA, '/rest/v1/profiles?select=id')).length, 1);
check('B sees exactly one profile', (await asUser(tokenB, '/rest/v1/profiles?select=id')).length, 1);
check("A cannot read B's profile", (await asUser(tokenA, `/rest/v1/profiles?id=eq.${idB}&select=id`)).length, 0);
check("B cannot read A's profile", (await asUser(tokenB, `/rest/v1/profiles?id=eq.${idA}&select=id`)).length, 0);

console.log('\nmatches — own row only');
check('A sees their match', (await asUser(tokenA, '/rest/v1/matches?select=score')).length, 1);
check("B cannot read A's match", (await asUser(tokenB, '/rest/v1/matches?select=score')).length, 0);

console.log('\nmatch_audit — own row only');
check('A sees their audit row', (await asUser(tokenA, '/rest/v1/match_audit?select=score')).length, 1);
check("B cannot read A's audit row", (await asUser(tokenB, '/rest/v1/match_audit?select=score')).length, 0);

console.log('\njobs — readable by any signed-in user, by design');
// Scoped to this run's job: jobs are shared, so a bare count grows every run.
check('B can browse the job A posted', (await asUser(tokenB, `/rest/v1/jobs?id=eq.${job.id}&select=id`)).length, 1);

console.log('\nanon — signed out is refused at the grant layer, before RLS');
// Assert the Postgres error code rather than the HTTP status: PostgREST answers
// 401 for the anon role and 403 for a signed-in one, but both carry 42501.
async function anonRefusal(path) {
  const response = await fetch(`${URL_BASE}${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  const body = await response.json();
  return response.ok ? `allowed (${response.status})` : body.code;
}
check('anon refused on profiles', await anonRefusal('/rest/v1/profiles?select=id'), '42501');
check('anon refused on jobs', await anonRefusal('/rest/v1/jobs?select=id'), '42501');
check('anon refused on match_audit', await anonRefusal('/rest/v1/match_audit?select=id'), '42501');

console.log('\nkeepalive — the one thing anon may call');
const keepalive = await fetch(`${URL_BASE}/rest/v1/rpc/keepalive`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
});
check('anon can call keepalive()', keepalive.status, 200);

console.log(failures.length ? `\n${failures.length} check(s) failed.\n` : '\nAll checks passed.\n');
process.exit(failures.length ? 1 : 0);
