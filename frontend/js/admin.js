// Admin dashboard: products CRUD, order list + status updates, banner
// uploads, and a simple sales report. Everything here talks to /api/*
// with the admin's bearer token attached automatically by api.js.

let CURRENT_TAB = 'products';

function requireAdminOrRedirect() {
  const user = getAuthUser();
  if (!user || !getAuthToken()) {
    window.location.href = '/admin';
    return null;
  }
  return user;
}

// Renders <option> tags for a category <select>, indenting subcategories
// under their parent so the hierarchy reads clearly in a flat dropdown.
function categoryOptionsHtml(categories, selectedId) {
  const parents = categories.filter((c) => !c.parent_id);
  return parents
    .map((parent) => {
      const children = categories.filter((c) => c.parent_id === parent.id);
      const parentOption = `<option value="${parent.id}" ${parent.id === selectedId ? 'selected' : ''}>${parent.name}</option>`;
      const childOptions = children
        .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>&nbsp;&nbsp;— ${c.name}</option>`)
        .join('');
      return parentOption + childOptions;
    })
    .join('');
}

function categoryLabel(categories, categoryId) {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return '—';
  if (!cat.parent_id) return cat.name;
  const parent = categories.find((c) => c.id === cat.parent_id);
  return parent ? `${parent.name} / ${cat.name}` : cat.name;
}

// Reads a <input type="file"> as a base64 data URL — good enough for demo
// mode; once Supabase is connected this is the natural place to swap in a
// real Storage upload (same call site, different implementation).
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderProductsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading products…</p>';
  const [{ products }, { categories }] = await Promise.all([api('/api/products'), api('/api/categories', { auth: false })]);

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a product</h3>
      <form id="add-product-form">
        <div class="form-row">
          <div class="form-field"><label for="p-name">Name</label><input id="p-name" required /></div>
          <div class="form-field"><label for="p-slug">URL slug</label><input id="p-slug" placeholder="e.g. sesame-oil" required /></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label for="p-price">Price (₹)</label><input id="p-price" type="number" min="0" step="0.01" required /></div>
          <div class="form-field">
            <label for="p-category">Category</label>
            <select id="p-category" required>${categoryOptionsHtml(categories, null)}</select>
          </div>
        </div>
        <div class="form-field"><label for="p-short">Short description</label><input id="p-short" /></div>
        <div class="form-field"><label for="p-desc">Full description</label><textarea id="p-desc" rows="3"></textarea></div>
        <div class="form-field"><label for="p-image">Product image</label><input id="p-image" type="file" accept="image/*" /></div>
        <button class="btn btn--primary" type="submit">Add Product</button>
        <p class="form-error" id="add-product-error" style="display:none;"></p>
      </form>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Category</th><th>Stock</th><th>Active</th><th></th></tr></thead>
        <tbody id="products-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = products
    .map(
      (p) => `
      <tr data-id="${p.id}">
        <td>
          <div style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:var(--sand-200);display:flex;align-items:center;justify-content:center;">
            ${p.image_url ? `<img src="${p.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;" />` : '<span style="font-size:0.65rem;color:var(--moss-700);">No image</span>'}
          </div>
          <input type="file" accept="image/*" data-image="${p.id}" style="margin-top:6px;font-size:0.7rem;width:110px;" />
        </td>
        <td>${p.name}</td>
        <td class="mono">${formatRupees(p.price_paise)}</td>
        <td>
          <select data-category="${p.id}">${categoryOptionsHtml(categories, p.category_id)}</select>
        </td>
        <td><input type="number" min="0" value="${p.stock}" data-stock="${p.id}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
        <td><input type="checkbox" data-active="${p.id}" ${p.is_active ? 'checked' : ''} /></td>
        <td><button class="btn btn--outline btn--sm" data-delete="${p.id}">Delete</button></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-stock]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/products/${input.getAttribute('data-stock')}`, {
        method: 'PATCH',
        body: { stock: parseInt(input.value, 10) || 0 },
      });
    });
  });
  tbody.querySelectorAll('[data-active]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/products/${input.getAttribute('data-active')}`, {
        method: 'PATCH',
        body: { is_active: input.checked },
      });
    });
  });
  tbody.querySelectorAll('[data-category]').forEach((select) => {
    select.addEventListener('change', async () => {
      await api(`/api/products/${select.getAttribute('data-category')}`, {
        method: 'PATCH',
        body: { category_id: select.value },
      });
    });
  });
  tbody.querySelectorAll('[data-image]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const image_url = await readFileAsDataUrl(file);
      await api(`/api/products/${input.getAttribute('data-image')}`, { method: 'PATCH', body: { image_url } });
      renderProductsTab();
    });
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this product?')) return;
      await api(`/api/products/${btn.getAttribute('data-delete')}`, { method: 'DELETE' });
      renderProductsTab();
    });
  });

  document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-product-error');
    errorEl.style.display = 'none';
    try {
      const imageFile = document.getElementById('p-image').files[0];
      const image_url = imageFile ? await readFileAsDataUrl(imageFile) : null;
      const categoryId = document.getElementById('p-category').value;
      const category = categoryLabel(categories, categoryId).split(' / ')[0].toLowerCase();
      await api('/api/products', {
        method: 'POST',
        body: {
          name: document.getElementById('p-name').value,
          slug: document.getElementById('p-slug').value,
          price_paise: Math.round(parseFloat(document.getElementById('p-price').value) * 100),
          category_id: categoryId,
          category,
          short_description: document.getElementById('p-short').value,
          description: document.getElementById('p-desc').value,
          image_url,
        },
      });
      renderProductsTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function renderCategoriesTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading categories…</p>';
  const { categories } = await api('/api/categories', { auth: false });

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a category or subcategory</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Leave "Parent" as "None" to create a top-level category (e.g. "Spices"). Pick a parent to create a subcategory under it (e.g. "Turmeric" under "Spices").</p>
      <div class="form-row">
        <div class="form-field"><label for="c-name">Name</label><input id="c-name" placeholder="e.g. Turmeric" required /></div>
        <div class="form-field"><label for="c-slug">URL slug</label><input id="c-slug" placeholder="e.g. turmeric" required /></div>
      </div>
      <div class="form-field">
        <label for="c-parent">Parent category</label>
        <select id="c-parent">
          <option value="">None (top-level category)</option>
          ${categories.filter((c) => !c.parent_id).map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--primary" id="add-category-btn">Add Category</button>
      <p class="form-error" id="add-category-error" style="display:none;"></p>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Category</th><th>Slug</th><th></th></tr></thead>
        <tbody id="categories-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('categories-tbody');
  const parents = categories.filter((c) => !c.parent_id);
  const rows = [];
  parents.forEach((parent) => {
    rows.push({ ...parent, displayName: parent.name });
    categories
      .filter((c) => c.parent_id === parent.id)
      .forEach((child) => rows.push({ ...child, displayName: `— ${child.name}` }));
  });
  tbody.innerHTML = rows
    .map((c) => `<tr><td>${c.displayName}</td><td class="mono">${c.slug}</td><td><button class="btn btn--outline btn--sm" data-delete-category="${c.id}">Delete</button></td></tr>`)
    .join('');

  tbody.querySelectorAll('[data-delete-category]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category? Products in it will keep their old category tag but lose the link.')) return;
      await api(`/api/categories/${btn.getAttribute('data-delete-category')}`, { method: 'DELETE' });
      renderCategoriesTab();
    });
  });

  document.getElementById('add-category-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('add-category-error');
    errorEl.style.display = 'none';
    try {
      await api('/api/categories', {
        method: 'POST',
        body: {
          name: document.getElementById('c-name').value,
          slug: document.getElementById('c-slug').value,
          parent_id: document.getElementById('c-parent').value || null,
        },
      });
      renderCategoriesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function renderOrdersTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading orders…</p>';
  const { orders } = await api('/api/orders');

  if (!orders.length) {
    wrap.innerHTML = '<div class="empty-state">No orders yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Invoice</th></tr></thead>
        <tbody>
          ${orders
            .map(
              (o) => `
            <tr data-id="${o.id}">
              <td class="mono">${o.order_number}</td>
              <td>${o.customer_name}<br /><span style="font-size:0.78rem;opacity:0.6;">${o.customer_email}</span></td>
              <td class="mono">${formatRupees(o.total_paise)}</td>
              <td><span class="status-pill status-${o.payment_status === 'paid' ? 'delivered' : 'placed'}">${o.payment_status}</span></td>
              <td>
                <select data-status="${o.id}">
                  ${['placed', 'packed', 'shipped', 'delivered', 'cancelled']
                    .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
              </td>
              <td><a href="/api/orders/${o.id}/invoice" target="_blank" rel="noopener">PDF</a></td>
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

async function renderBannersTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading banners…</p>';
  const { banners } = await api('/api/banners');

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a homepage banner</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Pick an image — it's stored as-is for now (demo mode). Once Supabase Storage is connected, uploads move there automatically.</p>
      <div class="form-field"><label for="b-title">Title</label><input id="b-title" /></div>
      <div class="form-field"><label for="b-file">Image</label><input id="b-file" type="file" accept="image/*" /></div>
      <div class="form-field"><label for="b-link">Link (optional)</label><input id="b-link" placeholder="/shop" /></div>
      <button class="btn btn--primary" id="add-banner-btn">Add Banner</button>
      <p class="form-error" id="add-banner-error" style="display:none;"></p>
    </div>
    <div class="products-grid" id="banners-grid"></div>
  `;

  const grid = document.getElementById('banners-grid');
  grid.innerHTML = banners.length
    ? banners
        .map(
          (b) => `<div class="card"><img src="${b.image_url}" alt="${b.title || ''}" style="width:100%;border-radius:8px;margin-bottom:8px;" /><strong>${b.title || 'Untitled'}</strong></div>`
        )
        .join('')
    : '<div class="empty-state">No banners yet.</div>';

  document.getElementById('add-banner-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('add-banner-error');
    errorEl.style.display = 'none';
    const fileInput = document.getElementById('b-file');
    const file = fileInput.files[0];
    if (!file) {
      errorEl.textContent = 'Choose an image first.';
      errorEl.style.display = 'block';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api('/api/banners', {
          method: 'POST',
          body: {
            title: document.getElementById('b-title').value,
            image_url: reader.result,
            link_url: document.getElementById('b-link').value,
          },
        });
        renderBannersTab();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  });
}

async function renderReportsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading report…</p>';
  const { orders } = await api('/api/orders');

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  const revenue = paidOrders.reduce((sum, o) => sum + o.total_paise, 0);
  const byStatus = {};
  orders.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:24px;">
      <div class="card"><div class="eyebrow">Total Orders</div><h2 style="margin:0;">${orders.length}</h2></div>
      <div class="card"><div class="eyebrow">Paid Orders</div><h2 style="margin:0;">${paidOrders.length}</h2></div>
      <div class="card"><div class="eyebrow">Revenue (Paid)</div><h2 style="margin:0;" class="mono">${formatRupees(revenue)}</h2></div>
    </div>
    <div class="card">
      <h3 class="mt-0">Orders by status</h3>
      ${Object.entries(byStatus)
        .map(([status, count]) => `<div class="flex-between"><span class="status-pill status-${status}">${status}</span><span class="mono">${count}</span></div>`)
        .join('') || '<p>No orders yet.</p>'}
    </div>
  `;
}

const TAB_RENDERERS = {
  products: renderProductsTab,
  categories: renderCategoriesTab,
  orders: renderOrdersTab,
  banners: renderBannersTab,
  reports: renderReportsTab,
};

async function loadModeNote() {
  const status = await api('/api/status', { auth: false });
  const note = document.getElementById('mode-note');
  if (status.mode === 'demo-data') {
    note.style.display = 'block';
    note.textContent = 'Running on in-memory demo data — nothing here persists across a server restart yet. Connect Supabase (see backend/.env) to make this permanent.';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAdminOrRedirect();
  if (!user) return;
  document.getElementById('admin-whoami').textContent = `${user.email || ''} (${user.role || 'admin'})`;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    clearAuthSession();
    window.location.href = '/admin';
  });

  document.querySelectorAll('.dashboard-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dashboard-nav button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_TAB = btn.getAttribute('data-tab');
      TAB_RENDERERS[CURRENT_TAB]();
    });
  });

  loadModeNote();
  renderProductsTab();
});
