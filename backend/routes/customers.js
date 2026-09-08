const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');
const { supabase, supabaseAdmin, isConfigured } = require('../lib/supabase');
const mock = require('../lib/mockStore');

const router = express.Router();

// GET /api/customers — admin/staff only. Every account (customers, plus
// staff/admin so their role shows too), for the admin "Customers" tab.
// Order counts/spend aren't included — the admin UI already loads
// /api/orders for the Reports tab and matches on email itself.
router.get('/', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ customers: await store.listCustomers() });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/points/adjust  { delta } -> { balance }
// Admin/staff-only manual Groove Points correction from the Customers tab
// (e.g. a goodwill credit, or fixing a mistake). Writes straight to the same
// loyalty_ledger table order-earned/redeemed entries use, just with reason
// 'manual_adjustment' — db/schema.sql already allows that reason string.
router.post('/:id/points/adjust', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const delta = Number((req.body || {}).delta);
    if (!delta || !Number.isFinite(delta)) {
      return res.status(400).json({ error: 'Enter a non-zero number of points.' });
    }

    const customers = await store.listCustomers();
    const target = customers.find((c) => c.id === id);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });

    await store.addLoyaltyEntry({
      user_id: id,
      order_id: null,
      points_delta: Math.round(delta),
      reason: 'manual_adjustment',
    });
    const balance = await store.getLoyaltyBalance(id);
    res.json({ balance });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/impersonate -> { token }
// Lets an admin/staff open the storefront signed in as a customer, to see
// exactly what they see (their orders, points balance, etc.) without ever
// touching or even seeing that customer's password. Restricted to
// role === 'customer' targets server-side — the frontend already hides the
// button for staff/admin rows, but that's just UI, so it's re-checked here.
//
// Live mode note: this used to hand the browser a Supabase magic-link
// action_link to open (window.open(actionLink)), relying on Supabase's own
// redirect-then-verify flow to land back on /impersonate-callback with the
// session in the URL hash. That flow silently fails — falls back to
// whatever's already logged in on that browser — unless the exact
// redirect_to URL is also added to Supabase's Authentication -> URL
// Configuration -> Redirect URLs allowlist, which /impersonate-callback
// never was (that's what caused "Log in as" to open the ADMIN's own
// session instead of the customer's). Fixed 2026-09-08 by generating the
// magic-link OTP and verifying it ourselves right here, server-side, via
// supabase.auth.verifyOtp — that hands back a real access token directly
// in this response, no redirect (and so no allowlist entry) required at
// all. Demo mode already worked this same way (a token in the JSON
// response), so both modes now share one simple client-side completion
// path in frontend/impersonate-callback.html.
router.post('/:id/impersonate', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const customers = await store.listCustomers();
    const target = customers.find((c) => c.id === id);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });
    if (target.role !== 'customer') {
      return res.status(403).json({ error: 'Can only sign in as customer accounts.' });
    }

    if (isConfigured) {
      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'This needs SUPABASE_SERVICE_ROLE_KEY set on the server — see backend/.env.' });
      }
      const { data: linkData, error: genError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: target.email,
      });
      if (genError) return res.status(400).json({ error: genError.message });
      const hashedToken = linkData && linkData.properties && linkData.properties.hashed_token;
      if (!hashedToken) return res.status(500).json({ error: 'Could not generate a sign-in link.' });

      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: hashedToken,
      });
      if (verifyError || !verifyData || !verifyData.session) {
        return res.status(400).json({ error: (verifyError && verifyError.message) || 'Could not sign in as this customer.' });
      }
      return res.json({ token: verifyData.session.access_token });
    }

    // Demo mode: no real Supabase Auth session to mint — reuse the same
    // in-memory session mechanism /api/auth/login uses.
    const user = mock.findUserById(id);
    if (!user) return res.status(404).json({ error: 'Customer not found.' });
    const token = mock.createSession(user);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
