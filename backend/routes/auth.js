const express = require('express');
const { supabase, isConfigured } = require('../lib/supabase');
const mock = require('../lib/mockStore');

const router = express.Router();

// POST /api/auth/register  { email, password, full_name } -> { token, user }
// Customer self-registration. Admin/staff accounts are never created this way —
// those come from Supabase (see docs/setup-guide.md) or the two fixed demo logins.
router.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  if (isConfigured) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) return res.status(400).json({ error: error.message });
    if (!data.session) {
      // Supabase project has "confirm email" turned on — no session yet.
      return res.status(201).json({
        pendingEmailConfirmation: true,
        message: 'Account created — check your email to confirm before signing in.',
      });
    }
    return res.status(201).json({
      token: data.session.access_token,
      user: { email: data.user.email, id: data.user.id },
      mode: 'supabase',
    });
  }

  const user = mock.registerCustomer({ email, password, full_name });
  if (!user) return res.status(409).json({ error: 'An account with that email already exists.' });
  const token = mock.createSession(user);
  res.status(201).json({
    token,
    user: { email: user.email, id: user.id, role: user.role, full_name: user.full_name },
    mode: 'demo',
  });
});

// POST /api/auth/login  { email, password } -> { token, user }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  if (isConfigured) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    return res.json({
      token: data.session.access_token,
      user: { email: data.user.email, id: data.user.id },
      mode: 'supabase',
    });
  }

  const user = mock.findUserByEmail(email);
  if (!user || user.password !== password) {
    return res.status(401).json({
      error: 'Invalid credentials. Demo admin/staff logins: admin@demo.groove or staff@demo.groove, password demo1234 — or register a customer account.',
    });
  }
  const token = mock.createSession(user);
  res.json({
    token,
    user: { email: user.email, id: user.id, role: user.role, full_name: user.full_name },
    mode: 'demo',
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isConfigured && token) mock.destroySession(token);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: req.user, mode: isConfigured ? 'supabase' : 'demo' });
});

module.exports = router;
