/* Generates config.js at build time (e.g. on Vercel) from environment variables.
   Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables.
   The anon key is public-safe (RLS protects data). Never expose the service_role key. */
const fs = require('fs');

const cfg = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
};

fs.writeFileSync('config.js', 'window.TA_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');

if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
  console.log('config.js written with Supabase env values ✓');
} else {
  console.warn('⚠ config.js written but SUPABASE_URL / SUPABASE_ANON_KEY are empty — set them in Vercel env vars.');
}
