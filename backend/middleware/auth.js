const { supabase, supabaseAdmin, isConfigured } = require('../lib/supabase');
const mock = require('../lib/mockStore');

// Resolves a bearer token to { userId, email, role, full_name } — or null.
// Works identically whether we're in demo mode (mock sessions) or wired up
// to real Supabase auth, so routes never need to know which one is active.
async function resolveUser(token) {
  if (!token) return null;

  if (isConfigured) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const client = supabaseAdmin || supabase;
    const { data: profile } = await client
      .from('profiles')
      .select('role, full_name')
      .eq('id', data.user.id)
      .maybeSingle();
    return {
      userId: data.user.id,
      email: data.user.email,
      role: profile?.role || 'customer',
      full_name: profile?.full_name || null,
    };
  }

  return mock.getSession(token);
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function attachUser(req, _res, next) {
  const token = getBearerToken(req);
  req.user = await resolveUser(token);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}.` });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole, resolveUser };
