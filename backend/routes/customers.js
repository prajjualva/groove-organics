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
    const note = typeof (req.body || {}).note === 'string' ? (req.body.note || '').trim().slice(0, 500) : '';
    if (!delta || !Number.isFinite(delta)) {
      return res.status(400).json({ error: 'Enter a non-zero number of points.' });
    }
    // Mandatory reason (Admin Phase 3) — the admin.js form already requires
    // this client-side, but enforcing it here too means a manual points
    // change can never land in the ledger without one, even via a direct
    // API call.
    if (!note) {
      return res.status(400).json({ error: 'A reason is required.' });
    }

    const customers = await store.listCustomers();
    const target = customers.find((c) => c.id === id);
    if (!target) return res.status(404).json({ error: 'Customer not found.' });

    await store.addLoyaltyEntry({
      user_id: id,
      order_id: null,
      points_delta: Math.round(delta),
      reason: 'manual_adjustment',
      note: note || null,
    });
    const balance = await store.getLoyaltyBalance(id);
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'customer.points_adjust', entityType: 'customer', entityId: id, summary: `${delta > 0 ? 'Added' : 'Removed'} ${Math.abs(Math.round(delta))} Groove Points ${delta > 0 ? 'to' : 'from'} ${target.email} — ${note}` }).catch(() => {});
    res.json({ balance });
  } catch (err) {
    next(err);
  }
});

// --- Admin Phase 3: the customer detail page's remaining tabs ---
// (Overview reuses GET /api/customers + GET /api/orders, already fetched by
// the Customers tab; the four routes below back Orders/Points/Addresses/
// Referrals so a customer's full picture doesn't need six new endpoints.)

// GET /api/customers/:id/orders — admin/staff. That customer's own order
// history (the flat /api/orders list the Customers tab already has could be
// filtered client-side by email, but a dedicated route keeps the detail
// page's data needs explicit and doesn't require shipping the whole store's
// orders to render one customer's tab).
router.get('/:id/orders', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ orders: await store.listOrdersForUser(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/points/ledger — admin/staff. The full earn/redeem/
// manual-adjustment history behind the balance shown in the customer list —
// previously only readable directly from the database (dataStore.js already
// had listLoyaltyLedger; nothing exposed it to the admin UI until now).
router.get('/:id/points/ledger', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ ledger: await store.listLoyaltyLedger(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/addresses — admin/staff. Same data as the
// customer's own GET /api/customer/addresses, just admin-scoped to any
// customer id instead of the logged-in user.
router.get('/:id/addresses', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ addresses: await store.listAddresses(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/referral — admin/staff. Same shape as the
// customer's own GET /api/customer/referral (their code/link/referred
// friends), plus who referred THEM, if anyone, so the admin can see both
// directions of the relationship in one tab.
router.get('/:id/referral', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, referredCount, pointsFromReferrals, referrals } = await store.getReferralStats(id);
    const profile = await store.getProfile(id);
    let referredBy = null;
    if (profile && profile.referred_by) {
      const customers = await store.listCustomers();
      const referrer = customers.find((c) => c.id === profile.referred_by);
      referredBy = referrer ? { id: referrer.id, full_name: referrer.full_name, email: referrer.email } : { id: profile.referred_by };
    }
    res.json({ code, referredCount, pointsFromReferrals, referrals, referredBy });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/customers/:id/status — admin only (not staff — deactivating an
// account is a higher-stakes action than the read/adjust-points actions
// staff can already do). Body: { is_active, reason? }.
router.patch('/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active, reason } = req.body || {};
    if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active (true/false) is required.' });
    if (id === req.user.userId && is_active === false) {
      return res.status(400).json({ error: "You can't deactivate your own account." });
    }
    const reasonText = typeof reason === 'string' ? reason.trim().slice(0, 500) || null : null;
    const ok = await store.setCustomerActive(id, { isActive: is_active, reason: reasonText });
    if (!ok) return res.status(404).json({ error: 'Customer not found.' });
    const customers = await store.listCustomers();
    const updated = customers.find((c) => c.id === id);
    store.logAudit({
      actor: req.user.email,
      actorRole: req.user.role,
      action: 'customer.status_change',
      entityType: 'customer',
      entityId: id,
      summary: `${is_active ? 'Reactivated' : 'Deactivated'} account ${updated ? updated.email : id}${!is_active && reasonText ? ` — ${reasonText}` : ''}`,
    }).catch(() => {});
    res.json({ customer: updated || { id, is_active } });
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
    if (target.is_active === false) {
      return res.status(403).json({ error: 'This account is deactivated — reactivate it first (Security tab) before signing in as it.' });
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
      store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'customer.impersonate', entityType: 'customer', entityId: id, summary: `Signed in as customer ${target.email}` }).catch(() => {});
      return res.json({ token: verifyData.session.access_token });
    }

    // Demo mode: no real Supabase Auth session to mint — reuse the same
    // in-memory session mechanism /api/auth/login uses.
    const user = mock.findUserById(id);
    if (!user) return res.status(404).json({ error: 'Customer not found.' });
    const token = mock.createSession(user);
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'customer.impersonate', entityType: 'customer', entityId: id, summary: `Signed in as customer ${target.email}` }).catch(() => {});
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
