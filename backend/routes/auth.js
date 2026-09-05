const express = require('express');
const { supabase, supabaseAdmin, isConfigured } = require('../lib/supabase');
const mock = require('../lib/mockStore');
const email = require('../lib/email');

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

// POST /api/auth/forgot-password  { email } -> { ok: true }
// Public and unauthenticated — hit from the "Forgot password?" link on the
// sign-in page, and reused as-is by the admin Customers tab's "Send reset
// link" button (an admin already knows the address is real; the response
// just doesn't need to say so out loud).
//
// Always answers with the same generic message whether or not the address
// has an account — a reset-password form that confirms/denies an email
// exists is a standard account-enumeration leak.
router.post('/forgot-password', async (req, res) => {
  const targetEmail = ((req.body || {}).email || '').trim().toLowerCase();
  const genericResponse = { ok: true, message: 'If an account exists for that email, a password reset link is on its way.' };
  if (!targetEmail) return res.status(400).json({ error: 'Email is required.' });

  const origin = process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host')}`;
  const redirectTo = `${origin}/reset-password`;

  try {
    if (isConfigured) {
      if (!supabaseAdmin) {
        console.error('[auth] forgot-password needs SUPABASE_SERVICE_ROLE_KEY set (admin API access) — see backend/.env.');
        return res.json(genericResponse);
      }
      // generateLink both checks the account exists and mints the one-time
      // recovery link — Supabase never emails it for us here, so we send it
      // ourselves via Resend (same email provider as the rest of the site).
      const { data, error: genError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: targetEmail,
        options: { redirectTo },
      });
      if (genError) {
        console.error('[auth] generateLink failed:', genError.message);
        return res.json(genericResponse); // most commonly "user not found" — never leak that
      }
      const actionLink = data && data.properties && data.properties.action_link;
      if (actionLink) {
        email.sendPasswordResetEmail(targetEmail, actionLink).catch((err) => console.error('sendPasswordResetEmail failed:', err.message));
      }
      return res.json(genericResponse);
    }

    // Demo mode: no real Supabase Auth to generate a recovery link from, so
    // mint our own short-lived token and point the email at our own
    // reset-password-demo endpoint instead of Supabase's.
    const user = mock.findUserByEmail(targetEmail);
    if (user) {
      const token = mock.createPasswordResetToken(targetEmail);
      const demoLink = `${redirectTo}?demo=1&token=${token}`;
      email.sendPasswordResetEmail(targetEmail, demoLink).catch((err) => console.error('sendPasswordResetEmail failed:', err.message));
    }
    return res.json(genericResponse);
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
    return res.json(genericResponse);
  }
});

// POST /api/auth/reset-password-demo  { token, password } -> { ok: true }
// Demo-mode-only stand-in for completing a reset. In real Supabase mode,
// reset-password.html completes the reset by calling Supabase's own
// /auth/v1/user REST endpoint directly with the recovery token from the
// email link — it never calls this route at all.
router.post('/reset-password-demo', async (req, res) => {
  if (isConfigured) {
    return res.status(400).json({ error: 'This server is using real Supabase auth — the reset link should complete the reset with Supabase directly.' });
  }
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'token and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const emailForToken = mock.consumePasswordResetToken(token);
  if (!emailForToken) return res.status(400).json({ error: 'This reset link is invalid or has expired — request a new one.' });
  mock.setUserPassword(emailForToken, password);
  res.json({ ok: true });
});

module.exports = router;
