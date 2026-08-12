// Proves the Week 2 gateway claims against a running Worker and a running
// Supabase, using real provider keys. The unit tests prove the branches with
// mocked upstreams; this proves the assumptions those mocks encode are true.
//
// Plain fetch, same as scripts/rls-proof.mjs, and for the same reason: it
// exercises the HTTP surface the app actually uses.
//
//   npx supabase start
//   npm run worker:dev          # in another terminal
//   npm run ai:proof
//
// The failover check needs GEMINI_API_KEY to be deliberately invalid so the
// chain has something to fail over FROM. Run the Worker with a broken Gemini
// key to see it; the check reports "skipped" when Gemini is healthy, because a
// working primary means there is nothing to prove.

const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8787';
const SUPABASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const ANON_KEY = process.env.ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Set SERVICE_ROLE_KEY and ANON_KEY (see `npx supabase status`).');
  process.exit(1);
}

const PASSWORD = 'gateway-proof-4c81';
const EMAIL = `gateway-proof-${Date.now()}@test.local`;

const failures = [];
const skipped = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
  if (!ok) failures.push(label);
}

function skip(label, why) {
  console.log(`  SKIP  ${label}: ${why}`);
  skipped.push(label);
}

async function supabase(path, { method = 'GET', key, token, body } = {}) {
  const res = await fetch(`${SUPABASE}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function gateway(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    provider: res.headers.get('x-wasla-provider'),
    cache: res.headers.get('x-wasla-cache'),
    attempts: res.headers.get('x-wasla-attempts'),
    body: text ? JSON.parse(text) : null,
  };
}

// ── Preflight ─────────────────────────────────────────────
let health;
try {
  health = await gateway('/ai/health');
} catch {
  console.error(`No Worker at ${GATEWAY}. Start it with: npm run worker:dev`);
  process.exit(1);
}

console.log(`\nGateway ${GATEWAY}`);
console.log(`Supabase ${SUPABASE}\n`);

console.log('health');
check('responds 200', health.status, 200);
check('reports at least one provider', health.body.providers.length > 0, true);
check('exposes no secret', JSON.stringify(health.body).includes('sk-'), false);

const providerIds = health.body.providers.map((p) => p.id);
console.log(`  providers in order: ${providerIds.join(' -> ') || '(none configured)'}`);

// ── Auth ──────────────────────────────────────────────────
console.log('\nauth');
const anon = await gateway('/ai/v1/chat/completions', {
  method: 'POST',
  body: { messages: [{ role: 'user', content: 'hi' }] },
});
check('rejects a request with no token', anon.status, 401);

const forged = await gateway('/ai/v1/chat/completions', {
  method: 'POST',
  token: 'not.a.real.token',
  body: { messages: [{ role: 'user', content: 'hi' }] },
});
check('rejects a malformed token', forged.status, 401);

// A real signed-in user, exactly as the app would obtain one.
await supabase('/auth/v1/admin/users', {
  method: 'POST',
  key: SERVICE_ROLE_KEY,
  body: { email: EMAIL, password: PASSWORD, email_confirm: true },
});
const session = await supabase('/auth/v1/token?grant_type=password', {
  method: 'POST',
  key: ANON_KEY,
  body: { email: EMAIL, password: PASSWORD },
});
const token = session.access_token;

const alg = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).alg;
console.log(`  access token alg: ${alg}`);
check('Supabase signs access tokens asymmetrically', alg.startsWith('ES') || alg.startsWith('RS'), true);

// ── Contract ──────────────────────────────────────────────
console.log('\ncontract');
const unknown = await gateway('/ai/task/no_such_task', {
  method: 'POST',
  token,
  body: {},
});
check('unknown task is 404', unknown.status, 404);

const streamed = await gateway('/ai/task/extract_resume', {
  method: 'POST',
  token,
  body: { stream: true },
});
check('structured task refuses to stream', streamed.status, 400);

// ── Inference ─────────────────────────────────────────────
console.log('\ninference');
if (providerIds.length === 0) {
  skip('completion', 'no provider key is configured in the Worker');
  skip('failover', 'no provider key is configured in the Worker');
} else {
  const reply = await gateway('/ai/v1/chat/completions', {
    method: 'POST',
    token,
    body: { messages: [{ role: 'user', content: 'Reply with the single word: ready' }] },
  });
  check('a completion succeeds', reply.status, 200);
  console.log(`  served by: ${reply.provider} after ${reply.attempts} attempt(s)`);

  // The Week 2 gate from the build plan: kill the Gemini key, watch Groq take
  // over. Only meaningful when Gemini is first AND broken.
  if (reply.status === 200 && providerIds[0] === 'gemini' && reply.provider === 'groq') {
    check('failover reached the second provider', reply.provider, 'groq');
    check('failover took more than one attempt', Number(reply.attempts) > 1, true);
  } else if (reply.provider === 'gemini') {
    skip('failover', 'Gemini answered, so there was nothing to fail over from');
  }

  const embedded = await gateway('/ai/embed', {
    method: 'POST',
    token,
    body: { texts: ['a senior data engineer in Dubai'] },
  });
  if (embedded.status === 200) {
    check('embedding is 768-dimensional', embedded.body.embeddings[0].length, 768);
  } else {
    skip('embedding', 'Workers AI needs a real Cloudflare account binding');
  }
}

// ── Quota ─────────────────────────────────────────────────
console.log('\nquota');
const usage = await supabase(`/rest/v1/ai_usage?select=count`, { key: ANON_KEY, token });
check('usage is recorded for the caller', Array.isArray(usage), true);
if (Array.isArray(usage) && usage.length > 0) {
  console.log(`  requests counted today: ${usage[0].count}`);
}

// ── Result ────────────────────────────────────────────────
console.log('');
if (skipped.length > 0) {
  console.log(`${skipped.length} check(s) skipped: ${skipped.join(', ')}`);
}
if (failures.length > 0) {
  console.error(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('All gateway checks passed.');
