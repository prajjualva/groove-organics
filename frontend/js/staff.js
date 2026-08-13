function requireStaffOrRedirect() {
  const user = getAuthUser();
  if (!user || !getAuthToken()) {
    window.location.href = '/staff';
    return null;
  }
  return user;
}

async function renderStaffOrders() {
  const wrap = document.getElementById('orders-content');
  wrap.innerHTML = '<p>Loading orders…</p>';
  const { orders } = await api('/api/orders');

  if (!orders.length) {
    wrap.innerHTML = '<div class="empty-state">No orders yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${orders
            .map(
              (o) => `
            <tr>
              <td class="mono">${o.order_number}</td>
              <td>${o.customer_name}</td>
              <td>${(o.order_items || []).map((i) => `${i.product_name} ×${i.quantity}`).join(', ')}</td>
              <td class="mono">${formatRupees(o.total_paise)}</td>
              <td>
                <select data-status="${o.id}">
                  ${['placed', 'packed', 'shipped', 'delivered']
                    .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      await api(`/api/orders/${select.getAttribute('data-status')}/status`, {
        method: 'PATCH',
        body: { status: select.value },
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const user = requireStaffOrRedirect();
  if (!user) return;
  document.getElementById('staff-whoami').textContent = `${user.email || ''} (${user.role || 'staff'})`;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    clearAuthSession();
    window.location.href = '/staff';
  });
  renderStaffOrders();
});
