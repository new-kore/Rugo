// Merge translated chunks (src/i18n/parts/out-*.json) into src/i18n/fr.json and es.json.
// Workflow for new screens: node scripts/i18n-extract.mjs → translate the new strings → node scripts/i18n-merge.mjs
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/i18n');
const out = { fr: {}, es: {} };
for (const lang of ['fr', 'es']) { const p = path.join(dir, `${lang}.json`); if (fs.existsSync(p)) Object.assign(out[lang], JSON.parse(fs.readFileSync(p, 'utf8'))); }
for (const f of fs.readdirSync(path.join(dir, 'parts')).filter((x) => /^out-.*\.json$/.test(x)).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'parts', f), 'utf8'));
  Object.assign(out.fr, j.fr); Object.assign(out.es, j.es);
}
for (const lang of ['fr', 'es']) {
  const sorted = Object.fromEntries(Object.entries(out[lang]).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(sorted, null, 1));
}
console.log(`fr ${Object.keys(out.fr).length} · es ${Object.keys(out.es).length}`);
