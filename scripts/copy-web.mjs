/* Assemble the static web app into www/ for Capacitor to package into the APK. */
import { mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';

const files = ['index.html', 'styles.css', 'app.js', 'seed.js', 'config.js'];

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });

for (const f of files) {
  if (!existsSync(f)) { console.warn('  (skip, not found) ' + f); continue; }
  copyFileSync(f, 'www/' + f);
}
console.log('Copied web assets to www/:', files.join(', '));
