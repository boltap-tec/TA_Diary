/* Assemble the static web app into www/ for Capacitor to package into the APK. */
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';

const files = ['index.html', 'styles.css', 'app.js', 'seed.js', 'config.js'];
const dirs = ['vendor'];   // local libraries bundled offline (e.g. html2pdf)

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });

for (const f of files) {
  if (!existsSync(f)) { console.warn('  (skip, not found) ' + f); continue; }
  copyFileSync(f, 'www/' + f);
}
function copyDir(src, dst){
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = src + '/' + name, d = dst + '/' + name;
    if (statSync(s).isDirectory()) copyDir(s, d); else copyFileSync(s, d);
  }
}
for (const dir of dirs) { if (existsSync(dir)) copyDir(dir, 'www/' + dir); }

console.log('Copied web assets to www/:', [...files, ...dirs.map(d=>d+'/')].join(', '));
