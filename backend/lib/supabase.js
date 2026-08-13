// Returns a configured Supabase client, or null if env vars aren't set yet.
// The rest of the app falls back to in-memory demo data whenever this is null,
// so the site is fully clickable before you've created a Supabase project.
const { createClient } = require('@supabase/supabase-js');

let client = null;
let adminClient = null;

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && anonKey) {
  client = createClient(url, anonKey);
}
if (url && serviceKey) {
  // Service-role client: bypasses RLS, used only for trusted backend writes
  // (creating orders, admin operations after we've verified the role ourselves).
  adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = {
  supabase: client,
  supabaseAdmin: adminClient,
  isConfigured: Boolean(client),
};
