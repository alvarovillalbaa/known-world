import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const html = fs.readFileSync('public/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (ids.length !== new Set(ids).size) throw new Error('Duplicate HTML IDs.');
const modules = fs.readdirSync('public/src').filter(file => file.endsWith('.js')).sort();
if (modules.join(',') !== 'app.js,geo.js,view-state.js,viewer.js,world.js') throw new Error('Native module contract is incomplete.');
const scripts = fs.readdirSync('scripts').filter(file => file.endsWith('.mjs')).map(file => `scripts/${file}`);
const tests = fs.readdirSync('tests').filter(file => file.endsWith('.js')).map(file => `tests/${file}`);
for (const file of [...modules.map(name => `public/src/${name}`), ...scripts, ...tests]) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`${file}: ${checked.stderr}`);
  const source = fs.readFileSync(file, 'utf8');
  if (file.startsWith('public/')) {
    for (const match of source.matchAll(/\b(?:byId|\$|document\.getElementById)\(['"]([^'"]+)['"]\)/g)) {
      if (!ids.includes(match[1])) throw new Error(`Missing DOM ID ${match[1]} in ${file}`);
    }
  }
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(file), match[1]))) throw new Error(`Missing import ${match[1]} from ${file}`);
  }
}
for (const match of html.matchAll(/\b(?:src|href)="(\/[^"?#]*)[^\"]*"/g)) {
  if (match[1] !== '/' && !fs.existsSync(path.join(root, 'public', match[1]))) throw new Error(`Missing public asset ${match[1]}`);
}
for (const file of ['package.json', 'vercel.json']) JSON.parse(fs.readFileSync(file, 'utf8'));
if (!fs.existsSync('docs/attribution.md')) throw new Error('Missing geography provenance.');
if (fs.statSync('public/icon.svg').size === 0) throw new Error('Missing icon.');
console.log(`PASS: ${modules.length} native modules, ${tests.length} frontend test files, syntax/imports, ${ids.length} unique DOM IDs, public assets and provenance.`);
