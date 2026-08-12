// Enforces the one design invariant that is easy to break silently:
// colour literals live in lib/theme.ts and nowhere else. app.config.ts is the
// single exception (native launch chrome), and its values must match theme.ts.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = 'lib/theme.ts';
const CONFIG = 'app.config.ts';
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

for (const colour of readFileSync(join(ROOT, CONFIG), 'utf8').match(COLOUR) ?? []) {
  if (!allowed.has(colour.toLowerCase())) {
    errors.push(`${CONFIG}: ${colour} is not a value in ${SOURCE}`);
  }
}

if (errors.length) {
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}

console.log(`check:theme — ${allowed.size} colours defined in ${SOURCE}, none leaked.`);
