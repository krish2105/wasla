// Enforces the one design invariant that is easy to break silently: colour
// literals live in lib/theme.ts and nowhere else. Two places cannot import it —
// app.config.ts (native launch chrome, baked into the binary) and the email
// templates (sent by Supabase, no access to the app bundle). Those may hold
// literals, but every one must still be a value defined in theme.ts.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = 'lib/theme.ts';
const MIRRORED = ['app.config.ts', 'supabase/templates/magic_link.html'];
const SCAN = ['app', 'components', 'lib'];
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

const allowed = new Set(
  (readFileSync(join(ROOT, SOURCE), 'utf8').match(COLOUR) ?? []).map((c) => c.toLowerCase())
);

const errors = [];

for (const dir of SCAN) {
  let files;
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue; // directory not created yet
  }
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel === SOURCE) continue;
    const found = readFileSync(file, 'utf8').match(COLOUR);
    if (found) errors.push(`${rel}: colour literal outside ${SOURCE} — ${[...new Set(found)].join(', ')}`);
  }
}

for (const file of MIRRORED) {
  for (const colour of readFileSync(join(ROOT, file), 'utf8').match(COLOUR) ?? []) {
    if (!allowed.has(colour.toLowerCase())) {
      errors.push(`${file}: ${colour} is not a value in ${SOURCE}`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}

console.log(`check:theme — ${allowed.size} colours defined in ${SOURCE}, none leaked.`);
