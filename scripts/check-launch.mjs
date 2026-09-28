// npm run check-launch            launch check (blocks on anything that must be settled first)
// PREVIEW=true npm run check-launch  preview check: faculty text still under review is allowed, noindex is added
// The deploy workflow runs this before every build.
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const exists = async (p) => access(new URL(p, root)).then(() => true, () => false);
const preview = process.env.PREVIEW === 'true';

const people = await read('src/data/people.json');
const partners = await read('src/data/partners.json');
const projects = await read('src/data/projects.json');
const news = await read('src/data/news.json');

const blockers = [];
const warnings = [];
const facultyIssue = (msg) => (preview ? warnings : blockers).push(msg);

// people.json is public: everyone in it must have consented. Pending people belong in the local-only file.
for (const f of people.faculty) if (!f.consent) facultyIssue(`faculty has not reviewed/approved their entry: ${f.name}`);
for (const g of people.roster) for (const m of g.members) if (!m.consent) blockers.push(`in people.json without consent: ${m.name} (${g.label}); move them to people.pending.json`);
if (process.env.CI && (await exists('src/data/people.pending.json'))) blockers.push('src/data/people.pending.json reached GitHub: it must stay local (it is in .gitignore)');

if (!partners.show) warnings.push('partner section hidden until partners agree in writing (decision 28 Sep 2026)');
for (const p of partners.show ? [...partners.gov, ...partners.intl] : []) {
  if (p.logoApproved && p.fairUse) blockers.push(`logo marked approved but the file is a fair-use copy: replace ${p.file} with the partner's official file`);
  // logo files live in public/ only once approved (copies of all of them are in 06_Website/prototype/ on Drive)
  if (p.logoApproved && !(await exists(`public/logos/${p.file}`))) blockers.push(`logo marked approved but public/logos/${p.file} is missing: copy the approved file in`);
  if (!p.logoApproved) warnings.push(`logo shown as text until approved: ${p.en}`);
}
if (!people.supportedBy.permission) warnings.push('"Supported by" section hidden until the Dean agrees');
for (const p of projects.items) if (!p.titleConfirmed) warnings.push(`project title/status not yet checked against the contract: ${p.title.slice(0, 70)}...`);
for (const n of news.items.slice(0, 4)) if (!n.confirmed) warnings.push(`news date not yet confirmed: ${n.title_en.slice(0, 70)}...`);
if (people.roster.every((g) => g.members.length === 0)) warnings.push('no researcher or student has consented yet: the roster shows a placeholder line');

console.log(`\n${preview ? 'Preview' : 'Launch'} check: ${blockers.length} blocking, ${warnings.length} to confirm\n`);
for (const b of blockers) console.log('  BLOCK  ' + b);
for (const w of warnings) console.log('  note   ' + w);
if (blockers.length) {
  console.log('\nNot publishing. Fix the BLOCK lines, then push again.\n');
  process.exit(1);
}
console.log(`\nOK to publish${preview ? ' as a preview (noindex, banner shown)' : ''}.\n`);
