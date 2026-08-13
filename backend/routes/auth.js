const express = require('express');
const { supabase, isConfigured } = require('../lib/supabase');
const mock = require('../lib/mockStore');

const router = express.Router();

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

  const user = mock.demoUsers.find((u) => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({
      error: 'Invalid demo credentials. Try admin@demo.groove / demo1234 or staff@demo.groove / demo1234.',
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
