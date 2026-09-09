function requireCustomerOrRedirect() {
  const user = getAuthUser();
  if (!user || !getAuthToken()) {
    window.location.href = `/account?redirect=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }
  return user;
}

async function renderOrdersTab() {
  const wrap = document.getElementById('account-tab-content');
  wrap.innerHTML = '<p>Loading your orders…</p>';
  try {
    const { orders } = await api('/api/customer/orders');

    if (!orders.length) {
      wrap.innerHTML = `<div class="empty-state">No orders yet. <a href="/shop" style="text-decoration:underline;">Start shopping</a>.</div>`;
      return;
    }

    wrap.innerHTML = orders
      .map(
        (o) => `
      <div class="card" style="margin-bottom:16px;">
        <div class="flex-between">
          <div>
            <strong class="mono">${o.order_number}</strong>
            <div style="font-size:0.8rem;color:var(--moss-700);">${new Date(o.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
          </div>
          <span class="status-pill status-${o.status}">${o.status}</span>
        </div>
        <div style="margin:12px 0;font-size:0.9rem;color:var(--moss-700);">
          ${(o.order_items || []).map((i) => `${i.product_name} ×${i.quantity}`).join(', ')}
        </div>
        <div class="flex-between">
          <span class="mono" style="font-weight:600;">${formatRupees(o.total_paise)}</span>
          <button class="btn btn--outline btn--sm" onclick="openInvoicePdf('${o.id}')">Invoice</button>
        </div>
      </div>`
      )
      .join('');
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">${err.message || "Couldn't load your orders."}</div>`;
  }
}

async function renderAddressesTab() {
  const wrap = document.getElementById('account-tab-content');
  wrap.innerHTML = '<p>Loading addresses…</p>';
  let addresses;
  try {
    ({ addresses } = await api('/api/customer/addresses'));
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">${err.message || "Couldn't load your addresses."}</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add an address</h3>
      <form id="add-address-form">
        <div class="form-row">
          <div class="form-field"><label for="a-label">Label</label><input id="a-label" placeholder="Home" value="Home" /></div>
          <div class="form-field"><label for="a-name">Full name</label><input id="a-name" required /></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label for="a-phone">Phone</label><input id="a-phone" /></div>
          <div class="form-field"><label for="a-pincode">Pincode</label><input id="a-pincode" required /></div>
        </div>
        <div class="form-field"><label for="a-line1">Address line 1</label><input id="a-line1" required /></div>
        <div class="form-field"><label for="a-line2">Address line 2 (optional)</label><input id="a-line2" /></div>
        <div class="form-row">
          <div class="form-field"><label for="a-city">City</label><input id="a-city" required /></div>
          <div class="form-field"><label for="a-state">State</label><input id="a-state" required /></div>
        </div>
        <button class="btn btn--primary" type="submit">Save Address</button>
        <p class="form-error" id="add-address-error" style="display:none;" aria-live="assertive"></p>
      </form>
    </div>
    <div id="addresses-list"></div>
  `;

  const list = document.getElementById('addresses-list');
  list.innerHTML = addresses.length
    ? addresses
        .map(
          (a) => `
      <div class="card" style="margin-bottom:12px;">
        <div class="flex-between">
          <div>
            <strong>${a.label || 'Address'}</strong>${a.is_default ? ' <span class="status-pill status-delivered">Default</span>' : ''}
            <p style="margin:6px 0 0;color:var(--moss-700);font-size:0.9rem;">${a.full_name}, ${a.line1}${a.line2 ? ', ' + a.line2 : ''}, ${a.city}, ${a.state} ${a.pincode}</p>
          </div>
          <button class="btn btn--outline btn--sm" data-delete-address="${a.id}">Remove</button>
        </div>
      </div>`
        )
        .join('')
    : '<div class="empty-state">No saved addresses yet.</div>';

  list.querySelectorAll('[data-delete-address]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/customer/addresses/${btn.getAttribute('data-delete-address')}`, { method: 'DELETE' });
        renderAddressesTab();
      } catch (err) {
        alert(err.message || "Couldn't remove that address.");
      }
    });
  });

  document.getElementById('add-address-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-address-error');
    errorEl.style.display = 'none';
    try {
      await api('/api/customer/addresses', {
        method: 'POST',
        body: {
          label: document.getElementById('a-label').value,
          full_name: document.getElementById('a-name').value,
          phone: document.getElementById('a-phone').value,
          line1: document.getElementById('a-line1').value,
          line2: document.getElementById('a-line2').value,
          city: document.getElementById('a-city').value,
          state: document.getElementById('a-state').value,
          pincode: document.getElementById('a-pincode').value,
        },
      });
      renderAddressesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function renderWishlistTab() {
  const wrap = document.getElementById('account-tab-content');
  wrap.innerHTML = '<p>Loading your wishlist…</p>';
  const { wishlist } = await api('/api/customer/wishlist');

  if (!wishlist.length) {
    wrap.innerHTML = `<div class="empty-state">Nothing saved yet. <a href="/shop" style="text-decoration:underline;">Browse the shop</a> and tap the heart on anything you love.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="products-grid" id="wishlist-grid"></div>`;
  const grid = document.getElementById('wishlist-grid');
  grid.innerHTML = wishlist.map(productCardHtml).join('');
  wireProductCardButtons(grid, wishlist);

  grid.querySelectorAll('.product-card').forEach((card, idx) => {
    const product = wishlist[idx];
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--outline btn--sm';
    removeBtn.textContent = 'Remove from Wishlist';
    removeBtn.style.marginTop = '8px';
    removeBtn.style.width = '100%';
    removeBtn.addEventListener('click', async () => {
      await api(`/api/customer/wishlist/${product.id}`, { method: 'DELETE' });
      renderWishlistTab();
    });
    card.appendChild(removeBtn);
  });
}

async function renderLoyaltyTab() {
  const wrap = document.getElementById('account-tab-content');
  wrap.innerHTML = '<p>Loading your Groove Points…</p>';
  try {
    const { balance, ledger } = await api('/api/loyalty/balance');
    wrap.innerHTML = `
      <div class="card" style="max-width:560px;">
        <h3 class="mt-0">Groove Points</h3>
        <p style="font-size:2rem;font-weight:700;margin:0;" class="mono">${balance}</p>
        <p style="color:var(--moss-700);">Earned on every paid order, redeemable at checkout for a discount.</p>
        <h4>History</h4>
        ${
          ledger.length
            ? ledger
                .map(
                  (l) =>
                    `<div class="flex-between" style="font-size:0.9rem;padding:6px 0;border-bottom:1px solid var(--sand-300);"><span>${
                      { order_earned: 'Earned', order_redeemed: 'Redeemed', referral_bonus: 'Referral bonus' }[l.reason] || 'Adjustment'
                    } ${l.order_id ? `— order ${l.order_id}` : ''}</span><span class="mono">${l.points_delta > 0 ? '+' : ''}${l.points_delta}</span></div>`
                )
                .join('')
            : '<p style="color:var(--moss-700);">No activity yet — points are earned once your first order is paid.</p>'
        }
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">${err.message || 'Could not load your Groove Points.'}</div>`;
  }
}

async function renderReferralTab() {
  const wrap = document.getElementById('account-tab-content');
  wrap.innerHTML = '<p>Loading your referral link…</p>';
  try {
    const { link, referredCount, pointsFromReferrals, referrals } = await api('/api/customer/referral');
    wrap.innerHTML = `
      <div class="card" style="max-width:720px;">
        <h3 class="mt-0">Refer & Earn</h3>
        <p style="color:var(--moss-700);">Share your link — when a friend signs up and orders, you earn Groove Points on every order they place.</p>
        <div class="form-field">
          <label for="referral-link">Your link</label>
          <div style="display:flex;gap:8px;">
            <input id="referral-link" value="${link}" readonly style="flex:1;" />
            <button class="btn btn--outline btn--sm" id="referral-copy-btn">Copy</button>
          </div>
        </div>
        <div class="flex-between" style="margin-top:16px;">
          <div><p style="font-size:1.6rem;font-weight:700;margin:0;" class="mono">${referredCount}</p><p style="color:var(--moss-700);margin:0;font-size:0.85rem;">Friends referred</p></div>
          <div><p style="font-size:1.6rem;font-weight:700;margin:0;" class="mono">${pointsFromReferrals}</p><p style="color:var(--moss-700);margin:0;font-size:0.85rem;">Points earned from referrals</p></div>
        </div>
      </div>

      <div class="card" style="max-width:720px;margin-top:16px;overflow-x:auto;">
        <h4 class="mt-0">Your friends</h4>
        ${
          referrals && referrals.length
            ? `<table class="data-table">
                <thead><tr><th>Name</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Points earned</th></tr></thead>
                <tbody>
                  ${referrals
                    .map(
                      (r) => `
                    <tr>
                      <td>${r.full_name || r.email || 'A friend'}</td>
                      <td>${r.joined_at ? new Date(r.joined_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                      <td>${r.paidOrderCount}${r.orderCount !== r.paidOrderCount ? ` (${r.orderCount} placed)` : ''}</td>
                      <td class="mono">${formatRupees(r.totalSpentPaise)}</td>
                      <td class="mono">${r.pointsEarnedFromThisFriend}</td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>`
            : '<p style="color:var(--moss-700);">No one has signed up with your link yet — once a friend does, they\'ll show up here along with what they\'ve bought.</p>'
        }
      </div>
    `;
    document.getElementById('referral-copy-btn').addEventListener('click', async () => {
      const btn = document.getElementById('referral-copy-btn');
      try {
        await navigator.clipboard.writeText(link);
        btn.textContent = 'Copied!';
      } catch (err) {
        document.getElementById('referral-link').select();
        btn.textContent = 'Select & copy';
      }
      setTimeout(() => (btn.textContent = 'Copy'), 2000);
    });
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">${err.message || 'Could not load your referral link.'}</div>`;
  }
}

async function renderProfileTab() {
  const user = getAuthUser();
  const wrap = document.getElementById('account-tab-content');
  wrap.innerHTML = `
    <div class="card" style="max-width:480px;">
      <h3 class="mt-0">Profile</h3>
      <div class="form-field"><label>Name</label><input value="${user.full_name || ''}" disabled /></div>
      <div class="form-field"><label>Email</label><input value="${user.email || ''}" disabled /></div>
      <p style="font-size:0.85rem;color:var(--moss-700);">Editing your name/email isn't wired up yet — ask me to add it whenever you'd like.</p>
    </div>
  `;
}

const ACCOUNT_TAB_RENDERERS = {
  orders: renderOrdersTab,
  addresses: renderAddressesTab,
  wishlist: renderWishlistTab,
  loyalty: renderLoyaltyTab,
  referral: renderReferralTab,
  profile: renderProfileTab,
};

document.addEventListener('DOMContentLoaded', () => {
  const user = requireCustomerOrRedirect();
  if (!user) return;

  renderSiteChrome('');
  document.getElementById('account-heading').textContent = `Welcome back, ${user.full_name || user.email}`;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    clearAuthSession();
    window.location.href = '/';
  });

  const startTab = window.location.pathname === '/wishlist' ? 'wishlist' : 'orders';
  document.querySelectorAll('#account-tabs button').forEach((btn) => {
    if (btn.getAttribute('data-tab') === startTab) {
      document.querySelectorAll('#account-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      document.querySelectorAll('#account-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ACCOUNT_TAB_RENDERERS[btn.getAttribute('data-tab')]();
    });
  });
  ACCOUNT_TAB_RENDERERS[startTab]();
});
