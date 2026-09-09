// Admin dashboard: products CRUD, order list + status updates, banner
// uploads, and a simple sales report. Everything here talks to /api/*
// with the admin's bearer token attached automatically by api.js.

let CURRENT_TAB = 'products';

// Must match backend/lib/mockStore.js's PROMO_TAG_OPTIONS — preset badges an
// admin can attach to a product (multiple at once), used for the product-card
// badge and to group products onto the /deals page.
const PROMO_TAG_OPTIONS = ['Sale Live', 'New Deal', 'Best Seller', 'Festive Offer', 'Limited Stock', 'Bundle Deal'];

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
  const [{ products }, { categories }, status, { shippingClasses }] = await Promise.all([
    api('/api/products'),
    api('/api/categories', { auth: false }),
    api('/api/status', { auth: false }),
    api('/api/shipping/classes', { auth: false }),
  ]);
  const defaultGstRatePercent = status.defaultGstRatePercent ?? 5;

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
        <div class="form-row">
          <div class="form-field">
            <label for="p-gst">GST rate % <span style="font-weight:400;color:var(--moss-700);">(leave blank to use the store default, ${defaultGstRatePercent}%)</span></label>
            <input id="p-gst" type="number" min="0" max="28" step="0.1" placeholder="${defaultGstRatePercent}" />
          </div>
          <div class="form-field">
            <label for="p-shipping">Extra shipping (₹ per unit) <span style="font-weight:400;color:var(--moss-700);">(0 = free shipping)</span></label>
            <input id="p-shipping" type="number" min="0" step="0.01" placeholder="0" />
          </div>
        </div>
        <div class="form-field"><label for="p-sku">SKU (optional)</label><input id="p-sku" placeholder="e.g. GRV-CCO-BASE" /></div>
        <div class="form-field"><label for="p-short">Short description</label><input id="p-short" /></div>
        <div class="form-field"><label for="p-desc">Full description</label><textarea id="p-desc" rows="3"></textarea></div>
        <div class="form-field"><label for="p-image">Product image</label><input id="p-image" type="file" accept="image/*" /></div>
        <button class="btn btn--primary" type="submit">Add Product</button>
        <p class="form-error" id="add-product-error" style="display:none;"></p>
      </form>
    </div>
    <div class="card">
      <p style="font-size:0.85rem;color:var(--moss-700);margin-top:0;">GST and shipping fields below: leave GST blank to use the store default (${defaultGstRatePercent}%); different products can carry different GST rates (e.g. 5% vs 12% vs 18%) since that's how it actually works under Indian GST law. Shipping is an extra charge added per unit of that product in the order — 0 means free shipping for it.</p>
      <table class="data-table">
        <thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Category</th><th>Stock</th><th>GST %</th><th>Ship ₹/unit</th><th>Active</th><th>Variants</th><th></th></tr></thead>
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
        <td><input type="number" min="0" max="28" step="0.1" value="${p.gst_rate_percent != null ? p.gst_rate_percent : ''}" placeholder="${defaultGstRatePercent}" data-gst="${p.id}" style="width:64px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
        <td><input type="number" min="0" step="0.01" value="${p.shipping_charge_paise ? (p.shipping_charge_paise / 100).toFixed(2) : ''}" placeholder="0" data-shipping="${p.id}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
        <td><input type="checkbox" data-active="${p.id}" ${p.is_active ? 'checked' : ''} /></td>
        <td>
          <button class="btn btn--outline btn--sm" data-toggle-variants="${p.id}">Sizes / Colors</button>
          <button class="btn btn--outline btn--sm" data-toggle-more="${p.id}" style="margin-top:4px;">Sale, Shipping & Tags</button>
          <button class="btn btn--outline btn--sm" data-toggle-content="${p.id}" style="margin-top:4px;">PDP Content</button>
          <button class="btn btn--outline btn--sm" data-toggle-inventory="${p.id}" style="margin-top:4px;">Inventory</button>
        </td>
        <td><button class="btn btn--outline btn--sm" data-delete="${p.id}">Delete</button></td>
      </tr>
      <tr class="variants-row" data-variants-for="${p.id}" style="display:none;">
        <td colspan="10"><div class="variants-panel" data-variants-panel="${p.id}"></div></td>
      </tr>
      <tr class="variants-row" data-more-for="${p.id}" style="display:none;">
        <td colspan="10"><div class="variants-panel" data-more-panel="${p.id}"></div></td>
      </tr>
      <tr class="variants-row" data-content-for="${p.id}" style="display:none;">
        <td colspan="10"><div class="variants-panel" data-content-panel="${p.id}"></div></td>
      </tr>
      <tr class="variants-row" data-inventory-for="${p.id}" style="display:none;">
        <td colspan="10"><div class="variants-panel" data-inventory-panel="${p.id}"></div></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-gst]').forEach((input) => {
    input.addEventListener('change', async () => {
      const raw = input.value.trim();
      await api(`/api/products/${input.getAttribute('data-gst')}`, {
        method: 'PATCH',
        body: { gst_rate_percent: raw === '' ? null : parseFloat(raw) },
      });
    });
  });
  tbody.querySelectorAll('[data-shipping]').forEach((input) => {
    input.addEventListener('change', async () => {
      const raw = input.value.trim();
      await api(`/api/products/${input.getAttribute('data-shipping')}`, {
        method: 'PATCH',
        body: { shipping_charge_paise: raw === '' ? 0 : Math.round(parseFloat(raw) * 100) },
      });
    });
  });

  tbody.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-variants');
      const row = tbody.querySelector(`[data-variants-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) await renderVariantsPanel(productId);
    });
  });
  tbody.querySelectorAll('[data-toggle-more]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-more');
      const row = tbody.querySelector(`[data-more-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) renderMoreDetailsPanel(productId, products.find((p) => p.id === productId), shippingClasses);
    });
  });
  tbody.querySelectorAll('[data-toggle-inventory]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-inventory');
      const row = tbody.querySelector(`[data-inventory-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) renderInventoryPanel(productId, products.find((p) => p.id === productId));
    });
  });
  tbody.querySelectorAll('[data-toggle-content]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-content');
      const row = tbody.querySelector(`[data-content-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) renderPdpContentPanel(productId, products.find((p) => p.id === productId));
    });
  });

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
      const gstRaw = document.getElementById('p-gst').value.trim();
      const shippingRaw = document.getElementById('p-shipping').value.trim();
      await api('/api/products', {
        method: 'POST',
        body: {
          name: document.getElementById('p-name').value,
          slug: document.getElementById('p-slug').value,
          price_paise: Math.round(parseFloat(document.getElementById('p-price').value) * 100),
          category_id: categoryId,
          category,
          gst_rate_percent: gstRaw === '' ? null : parseFloat(gstRaw),
          shipping_charge_paise: shippingRaw === '' ? 0 : Math.round(parseFloat(shippingRaw) * 100),
          sku: document.getElementById('p-sku').value.trim() || null,
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

// Sale price, weight/dimensions (for automatic weight-based shipping), HSN
// code and promo-tag badges — grouped together since they're all edited
// less often than price/stock/GST, opened from "Sale, Shipping & Tags".
function renderMoreDetailsPanel(productId, product, shippingClasses) {
  const panel = document.querySelector(`[data-more-panel="${productId}"]`);
  const tags = product.promo_tags || [];
  const classes = shippingClasses || [];
  panel.innerHTML = `
    <div class="form-row">
      <div class="form-field">
        <label>Sale price (₹) <span style="font-weight:400;color:var(--moss-700);">(shown struck-through against the regular price — leave blank for no sale)</span></label>
        <input type="number" min="0" step="0.01" data-more-compare value="${product.compare_at_price_paise ? (product.compare_at_price_paise / 100).toFixed(2) : ''}" />
      </div>
      <div class="form-field"><label>HSN code</label><input data-more-hsn value="${product.hsn_code || ''}" placeholder="e.g. 15131900" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>SKU (base product)</label><input data-more-sku value="${escapeAttr(product.sku)}" placeholder="e.g. GRV-CCO-BASE" /></div>
      <div class="form-field"><label>Barcode (GTIN/UPC/EAN, optional)</label><input data-more-barcode value="${escapeAttr(product.barcode)}" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Weight (grams)</label><input type="number" min="0" data-more-weight value="${product.weight_grams != null ? product.weight_grams : ''}" /></div>
      <div class="form-field"><label>Length (cm)</label><input type="number" min="0" step="0.1" data-more-length value="${product.length_cm != null ? product.length_cm : ''}" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Width (cm)</label><input type="number" min="0" step="0.1" data-more-width value="${product.width_cm != null ? product.width_cm : ''}" /></div>
      <div class="form-field"><label>Height (cm)</label><input type="number" min="0" step="0.1" data-more-height value="${product.height_cm != null ? product.height_cm : ''}" /></div>
    </div>
    <div class="form-field">
      <label>Shipping class (optional)</label>
      <select data-more-shipping-class>
        <option value="">— None (use the flat "Extra shipping ₹/unit" above, or weight-based rates) —</option>
        ${classes.map((c) => `<option value="${c.id}" ${product.shipping_class_id === c.id ? 'selected' : ''}>${escapeAttr(c.name)}${c.flat_rate_paise != null ? ` (${formatRupees(c.flat_rate_paise)})` : ''}${c.is_active === false ? ' — inactive' : ''}</option>`).join('')}
      </select>
      <p style="font-size:0.78rem;color:var(--moss-700);margin:4px 0 0;">Assigns this product to a shared shipping rule (Admin → Shipping Rates → Shipping Classes) instead of a one-off flat charge. Only used if "Extra shipping ₹/unit" above is 0.</p>
    </div>
    <p style="font-size:0.8rem;color:var(--moss-700);">Weight and dimensions drive automatic shipping cost (Admin → Shipping Rates) — leave them blank if you're using the flat "Extra shipping" override in the table above (or a shipping class) instead.</p>
    <div class="form-field"><label>SEO title (optional, browser tab / search result title)</label><input data-more-seo-title value="${escapeAttr(product.seo_title)}" placeholder="${escapeAttr(product.name)} — Groove Organics" /></div>
    <div class="form-field"><label>SEO meta description (optional)</label><textarea data-more-seo-desc rows="2">${product.seo_meta_description || ''}</textarea></div>
    <div class="form-field">
      <label>Promo tags / badges (pick any that apply)</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${PROMO_TAG_OPTIONS.map(
          (tag) => `
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:0.85rem;">
            <input type="checkbox" data-more-tag value="${tag}" ${tags.includes(tag) ? 'checked' : ''} /> ${tag}
          </label>`
        ).join('')}
      </div>
      <p style="font-size:0.8rem;color:var(--moss-700);">Tagged products automatically appear on the <a href="/deals" target="_blank">/deals</a> page, grouped by tag.</p>
    </div>
    <button class="btn btn--primary btn--sm" data-save-more="${productId}">Save</button>
    <span class="form-error" data-more-saved style="display:none;color:var(--moss-700);">Saved.</span>
  `;
  panel.querySelector('[data-save-more]').addEventListener('click', async () => {
    const compareRaw = panel.querySelector('[data-more-compare]').value.trim();
    const weightRaw = panel.querySelector('[data-more-weight]').value.trim();
    const lengthRaw = panel.querySelector('[data-more-length]').value.trim();
    const widthRaw = panel.querySelector('[data-more-width]').value.trim();
    const heightRaw = panel.querySelector('[data-more-height]').value.trim();
    const selectedTags = Array.from(panel.querySelectorAll('[data-more-tag]:checked')).map((el) => el.value);
    await api(`/api/products/${productId}`, {
      method: 'PATCH',
      body: {
        compare_at_price_paise: compareRaw === '' ? null : Math.round(parseFloat(compareRaw) * 100),
        hsn_code: panel.querySelector('[data-more-hsn]').value.trim() || null,
        sku: panel.querySelector('[data-more-sku]').value.trim() || null,
        barcode: panel.querySelector('[data-more-barcode]').value.trim() || null,
        weight_grams: weightRaw === '' ? null : parseInt(weightRaw, 10),
        length_cm: lengthRaw === '' ? null : parseFloat(lengthRaw),
        width_cm: widthRaw === '' ? null : parseFloat(widthRaw),
        height_cm: heightRaw === '' ? null : parseFloat(heightRaw),
        shipping_class_id: panel.querySelector('[data-more-shipping-class]').value || null,
        promo_tags: selectedTags,
        seo_title: panel.querySelector('[data-more-seo-title]').value.trim() || null,
        seo_meta_description: panel.querySelector('[data-more-seo-desc]').value.trim() || null,
      },
    });
    const saved = panel.querySelector('[data-more-saved]');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });
}

// Stock adjustment reasons — must read sensibly for a paper-trail entry
// ("received 20 units, reason: received"). 'manual_edit' is written
// automatically by the plain quick-edit stock field, not offered here.
const STOCK_ADJUSTMENT_REASONS = [
  { value: 'received', label: 'Stock received (restock / new delivery)' },
  { value: 'damaged', label: 'Damaged / lost' },
  { value: 'correction', label: 'Count correction' },
  { value: 'return', label: 'Customer return restocked' },
  { value: 'other', label: 'Other' },
];

function stockAdjustmentReasonLabel(reason) {
  if (reason === 'manual_edit') return 'Quick-edit (Products table)';
  const match = STOCK_ADJUSTMENT_REASONS.find((r) => r.value === reason);
  return match ? match.label : reason;
}

// Inventory panel — SKU/barcode, low-stock threshold override, reserved
// stock, and the audited stock-adjustment ledger (Admin Phase 2). The plain
// Stock number in the main Products table still works for a fast edit; this
// panel is for an intentional adjustment with a reason attached, plus
// seeing the history of every change (including those quick edits, logged
// automatically as "Quick-edit").
async function renderInventoryPanel(productId, product) {
  const panel = document.querySelector(`[data-inventory-panel="${productId}"]`);
  panel.innerHTML = '<p>Loading inventory…</p>';
  const { adjustments } = await api(`/api/products/${productId}/stock-adjustments`).catch(() => ({ adjustments: [] }));

  const reserved = product.reserved_stock || 0;
  const available = Math.max(0, (product.stock || 0) - reserved);

  panel.innerHTML = `
    <div class="form-row">
      <div class="form-field"><label>SKU</label><div class="mono">${product.sku || '—'}</div></div>
      <div class="form-field"><label>Barcode</label><div class="mono">${product.barcode || '—'}</div></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Current stock</label><div class="mono">${product.stock || 0}</div></div>
      <div class="form-field">
        <label>Reserved (held back, not sold online)</label>
        <input type="number" min="0" data-inv-reserved value="${reserved}" style="width:100px;" />
      </div>
      <div class="form-field"><label>Available to sell</label><div class="mono">${available}</div></div>
    </div>
    <p style="font-size:0.78rem;color:var(--moss-700);">Reserved stock is a manual hold (e.g. for an offline sale or a B2B order) — it is not yet wired into checkout, so an online order does not automatically reserve or release stock in this phase.</p>
    <div class="form-field">
      <label>Low-stock alert threshold override <span style="font-weight:400;color:var(--moss-700);">(blank = use the store default, set in Store Settings)</span></label>
      <input type="number" min="0" data-inv-low-stock value="${product.low_stock_threshold != null ? product.low_stock_threshold : ''}" style="width:100px;" />
    </div>
    <button class="btn btn--primary btn--sm" data-inv-save="${productId}">Save</button>
    <span class="form-error" data-inv-saved style="display:none;color:var(--moss-700);">Saved.</span>

    <h4 style="margin-top:20px;">Adjust stock</h4>
    <div class="form-row">
      <div class="form-field"><label>Change (units, use a negative number to remove)</label><input type="number" data-inv-delta placeholder="e.g. 20 or -5" style="width:140px;" /></div>
      <div class="form-field">
        <label>Reason</label>
        <select data-inv-reason>${STOCK_ADJUSTMENT_REASONS.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-field"><label>Note (optional)</label><input data-inv-note placeholder="e.g. Delivery from supplier, invoice #1234" /></div>
    <button class="btn btn--outline btn--sm" data-inv-adjust="${productId}">Record Adjustment</button>
    <p class="form-error" data-inv-adjust-error style="display:none;"></p>

    <h4 style="margin-top:20px;">History</h4>
    <table class="data-table">
      <thead><tr><th>When</th><th>Change</th><th>Stock after</th><th>Reason</th><th>Note</th><th>By</th></tr></thead>
      <tbody>
        ${
          adjustments.length
            ? adjustments
                .map(
                  (a) => `
              <tr>
                <td>${new Date(a.created_at).toLocaleString()}</td>
                <td class="mono" style="color:${a.delta > 0 ? 'var(--moss-700)' : 'var(--clay-500)'};">${a.delta > 0 ? '+' : ''}${a.delta}</td>
                <td class="mono">${a.new_stock}</td>
                <td>${stockAdjustmentReasonLabel(a.reason)}</td>
                <td>${a.note ? escapeAttr(a.note) : '—'}</td>
                <td>${a.adjusted_by || '—'}</td>
              </tr>`
                )
                .join('')
            : '<tr><td colspan="6" style="color:var(--moss-700);">No stock changes recorded yet.</td></tr>'
        }
      </tbody>
    </table>
  `;

  panel.querySelector('[data-inv-save]').addEventListener('click', async () => {
    const reservedRaw = panel.querySelector('[data-inv-reserved]').value.trim();
    const lowStockRaw = panel.querySelector('[data-inv-low-stock]').value.trim();
    await api(`/api/products/${productId}`, {
      method: 'PATCH',
      body: {
        reserved_stock: reservedRaw === '' ? 0 : parseInt(reservedRaw, 10) || 0,
        low_stock_threshold: lowStockRaw === '' ? null : parseInt(lowStockRaw, 10),
      },
    });
    product.reserved_stock = reservedRaw === '' ? 0 : parseInt(reservedRaw, 10) || 0;
    product.low_stock_threshold = lowStockRaw === '' ? null : parseInt(lowStockRaw, 10);
    const saved = panel.querySelector('[data-inv-saved]');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
    renderInventoryPanel(productId, product);
  });

  panel.querySelector('[data-inv-adjust]').addEventListener('click', async () => {
    const errorEl = panel.querySelector('[data-inv-adjust-error]');
    errorEl.style.display = 'none';
    const delta = parseInt(panel.querySelector('[data-inv-delta]').value, 10);
    const reason = panel.querySelector('[data-inv-reason]').value;
    const note = panel.querySelector('[data-inv-note]').value.trim();
    if (!delta) {
      errorEl.textContent = 'Enter a non-zero change amount.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      const { product: updated } = await api(`/api/products/${productId}/stock-adjustments`, {
        method: 'POST',
        body: { delta, reason, note: note || null },
      });
      product.stock = updated.stock;
      renderInventoryPanel(productId, product);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// PDP content editor — the admin-editable side of the Phase 1b Product
// Detail Page rebuild (gallery / key benefits / ingredients / shipping note
// / FAQ). Every field here is optional; the storefront PDP only renders a
// section when it's actually filled in, so leaving everything blank just
// keeps the shorter original page — nothing is ever fabricated to fill a
// gap. FAQ uses one "Question | Answer" pair per line for a fast plain-text
// editor rather than a full repeating-field-group UI.
function renderPdpContentPanel(productId, product) {
  const panel = document.querySelector(`[data-content-panel="${productId}"]`);
  const gallery = product.gallery_images || [];
  const benefits = product.key_benefits || [];
  const faq = product.faq || [];
  panel.innerHTML = `
    <div class="form-field">
      <label>Gallery photos (in addition to the main product image above)</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;" data-gallery-thumbs>
        ${gallery
          .map(
            (src, i) => `<span style="position:relative;display:inline-block;">
              <img src="${src}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;" />
              <button type="button" data-remove-gallery="${i}" style="position:absolute;top:-6px;right:-6px;background:var(--clay-500);color:white;border:none;border-radius:999px;width:18px;height:18px;font-size:0.7rem;cursor:pointer;line-height:1;">×</button>
            </span>`
          )
          .join('')}
      </div>
      <input type="file" accept="image/*" data-add-gallery-photo />
    </div>
    <div class="form-field">
      <label>Key benefits (one per line, shown as a checklist)</label>
      <textarea rows="3" data-content-benefits placeholder="Wood-pressed, never heated&#10;Unrefined and unfiltered">${benefits.join('\n')}</textarea>
    </div>
    <div class="form-field">
      <label>Ingredients</label>
      <textarea rows="2" data-content-ingredients placeholder="100% Cold-Pressed Coconut Oil. No additives.">${product.ingredients_info || ''}</textarea>
    </div>
    <div class="form-field">
      <label>Shipping note (optional — shown alongside the automatic free-shipping/weight-based facts)</label>
      <textarea rows="2" data-content-shipping placeholder="e.g. Ships in recyclable packaging.">${product.shipping_info || ''}</textarea>
    </div>
    <div class="form-field">
      <label>Product FAQ — one "Question | Answer" pair per line</label>
      <textarea rows="4" data-content-faq placeholder="Is this cold-pressed? | Yes, wood-pressed using the traditional chekku method.">${faq.map((f) => `${f.question} | ${f.answer}`).join('\n')}</textarea>
    </div>
    <button class="btn btn--primary btn--sm" data-save-content="${productId}">Save</button>
    <span class="form-error" data-content-saved style="display:none;color:var(--moss-700);">Saved.</span>
  `;

  let currentGallery = [...gallery];

  panel.querySelectorAll('[data-remove-gallery]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-remove-gallery'), 10);
      currentGallery.splice(idx, 1);
      renderPdpContentPanelGalleryOnly();
    });
  });

  function renderPdpContentPanelGalleryOnly() {
    const thumbs = panel.querySelector('[data-gallery-thumbs]');
    thumbs.innerHTML = currentGallery
      .map(
        (src, i) => `<span style="position:relative;display:inline-block;">
          <img src="${src}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;" />
          <button type="button" data-remove-gallery="${i}" style="position:absolute;top:-6px;right:-6px;background:var(--clay-500);color:white;border:none;border-radius:999px;width:18px;height:18px;font-size:0.7rem;cursor:pointer;line-height:1;">×</button>
        </span>`
      )
      .join('');
    thumbs.querySelectorAll('[data-remove-gallery]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove-gallery'), 10);
        currentGallery.splice(idx, 1);
        renderPdpContentPanelGalleryOnly();
      });
    });
  }

  panel.querySelector('[data-add-gallery-photo]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    currentGallery.push(dataUrl);
    e.target.value = '';
    renderPdpContentPanelGalleryOnly();
  });

  panel.querySelector('[data-save-content]').addEventListener('click', async () => {
    const benefitsList = panel
      .querySelector('[data-content-benefits]')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const faqList = panel
      .querySelector('[data-content-faq]')
      .value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [q, ...rest] = line.split('|');
        return { question: (q || '').trim(), answer: rest.join('|').trim() };
      })
      .filter((f) => f.question && f.answer);

    await api(`/api/products/${productId}`, {
      method: 'PATCH',
      body: {
        gallery_images: currentGallery,
        key_benefits: benefitsList,
        ingredients_info: panel.querySelector('[data-content-ingredients]').value.trim() || null,
        shipping_info: panel.querySelector('[data-content-shipping]').value.trim() || null,
        faq: faqList,
      },
    });
    product.gallery_images = currentGallery;
    const saved = panel.querySelector('[data-content-saved]');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });
}

// Inline size/color variant editor for a single product, opened from the
// Products table's "Sizes / Colors" button. A product with no rows here
// is just sold as-is using its own price_paise/stock (simple case stays
// simple) — variants are only needed once a product comes in more than
// one size and/or color.
async function renderVariantsPanel(productId) {
  const panel = document.querySelector(`[data-variants-panel="${productId}"]`);
  panel.innerHTML = '<p>Loading variants…</p>';
  const { variants } = await api(`/api/products/${productId}/variants`, { auth: false });

  panel.innerHTML = `
    <table class="data-table" style="margin-bottom:16px;">
      <thead><tr><th>Size</th><th>Color</th><th>Price (₹)</th><th>Stock</th><th>SKU</th><th>Barcode</th><th></th></tr></thead>
      <tbody>
        ${
          variants.length
            ? variants
                .map(
                  (v) => `
              <tr data-variant-id="${v.id}">
                <td>${v.size || '—'}</td>
                <td>${v.color || '—'}</td>
                <td class="mono">${formatRupees(v.price_paise)}</td>
                <td><input type="number" min="0" value="${v.stock}" data-variant-stock="${v.id}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
                <td class="mono">${v.sku || '—'}</td>
                <td class="mono">${v.barcode || '—'}</td>
                <td><button class="btn btn--outline btn--sm" data-delete-variant="${v.id}">Delete</button></td>
              </tr>`
                )
                .join('')
            : '<tr><td colspan="7" style="color:var(--moss-700);">No variants yet — this product sells as a single item.</td></tr>'
        }
      </tbody>
    </table>
    <p style="font-size:0.78rem;color:var(--moss-700);margin-top:-8px;">Stock changed here is auto-logged to that product's Inventory history as a quick-edit.</p>
    <div class="form-row">
      <div class="form-field"><label>Size (optional)</label><input data-new-variant-size placeholder="e.g. 500ml" /></div>
      <div class="form-field"><label>Color (optional)</label><input data-new-variant-color placeholder="e.g. Green" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Price (₹)</label><input type="number" min="0" step="0.01" data-new-variant-price /></div>
      <div class="form-field"><label>Stock</label><input type="number" min="0" data-new-variant-stock value="0" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>SKU (optional)</label><input data-new-variant-sku /></div>
      <div class="form-field"><label>Barcode (optional)</label><input data-new-variant-barcode /></div>
    </div>
    <button class="btn btn--primary btn--sm" data-add-variant="${productId}">Add Variant</button>
    <p class="form-error" data-variant-error style="display:none;"></p>
  `;

  panel.querySelectorAll('[data-variant-stock]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/variants/${input.getAttribute('data-variant-stock')}`, {
        method: 'PATCH',
        body: { stock: parseInt(input.value, 10) || 0 },
      });
    });
  });
  panel.querySelectorAll('[data-delete-variant]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this variant?')) return;
      await api(`/api/variants/${btn.getAttribute('data-delete-variant')}`, { method: 'DELETE' });
      renderVariantsPanel(productId);
    });
  });
  panel.querySelector('[data-add-variant]').addEventListener('click', async () => {
    const errorEl = panel.querySelector('[data-variant-error]');
    errorEl.style.display = 'none';
    const size = panel.querySelector('[data-new-variant-size]').value.trim();
    const color = panel.querySelector('[data-new-variant-color]').value.trim();
    const priceRupees = panel.querySelector('[data-new-variant-price]').value;
    const stock = panel.querySelector('[data-new-variant-stock]').value;
    const sku = panel.querySelector('[data-new-variant-sku]').value.trim();
    const barcode = panel.querySelector('[data-new-variant-barcode]').value.trim();
    if (!size && !color) {
      errorEl.textContent = 'Enter a size or a color (or both).';
      errorEl.style.display = 'block';
      return;
    }
    if (!priceRupees) {
      errorEl.textContent = 'Price is required.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api(`/api/products/${productId}/variants`, {
        method: 'POST',
        body: {
          size: size || null,
          color: color || null,
          price_paise: Math.round(parseFloat(priceRupees) * 100),
          stock: parseInt(stock, 10) || 0,
          sku: sku || null,
          barcode: barcode || null,
        },
      });
      renderVariantsPanel(productId);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function renderCategoriesTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading categories…</p>';
  // Authenticated (not auth:false) so an admin/staff token is sent — the
  // backend then includes deactivated categories too (Admin Phase 5's new
  // is_active toggle), not just the active ones the public storefront sees.
  const { categories } = await api('/api/categories');

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
      <p style="font-size:0.85rem;color:var(--moss-700);margin-top:0;">Use the arrows to reorder — this is the order categories appear in shop filters and nav menus. Top-level categories and each parent's own subcategories reorder independently of each other.</p>
      <table class="data-table">
        <thead><tr><th>Category</th><th>Slug</th><th>Status</th><th></th></tr></thead>
        <tbody id="categories-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('categories-tbody');
  const parents = categories.filter((c) => !c.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  // Rows carry their position within their own sibling group (top-level
  // categories among themselves, each parent's subcategories among
  // themselves) so the up/down buttons swap sort_order with the right
  // neighbor rather than across unrelated groups.
  const rows = [];
  parents.forEach((parent, pIdx) => {
    rows.push({ ...parent, displayName: parent.name, siblingIndex: pIdx, siblingCount: parents.length });
    const children = categories.filter((c) => c.parent_id === parent.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    children.forEach((child, cIdx) => rows.push({ ...child, displayName: `— ${child.name}`, siblingIndex: cIdx, siblingCount: children.length }));
  });
  tbody.innerHTML = rows
    .map(
      (c) => `<tr data-id="${c.id}">
        <td>${c.displayName}</td>
        <td class="mono">${c.slug}</td>
        <td><span class="status-pill status-${c.is_active === false ? 'cancelled' : 'delivered'}">${c.is_active === false ? 'Inactive' : 'Active'}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn--outline btn--sm" data-move-category="${c.id}" data-direction="up" ${c.siblingIndex === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="btn btn--outline btn--sm" data-move-category="${c.id}" data-direction="down" ${c.siblingIndex === c.siblingCount - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="btn btn--outline btn--sm" data-toggle-category-detail="${c.id}">Details</button>
          <button class="btn btn--outline btn--sm" data-delete-category="${c.id}">Delete</button>
        </td>
      </tr>
      <tr class="variants-row" data-category-detail-for="${c.id}" style="display:none;">
        <td colspan="4"><div class="variants-panel" data-category-detail-panel="${c.id}"></div></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-delete-category]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category? Products in it will keep their old category tag but lose the link.')) return;
      await api(`/api/categories/${btn.getAttribute('data-delete-category')}`, { method: 'DELETE' });
      renderCategoriesTab();
    });
  });
  tbody.querySelectorAll('[data-toggle-category-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-toggle-category-detail');
      const row = tbody.querySelector(`[data-category-detail-for="${id}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      btn.textContent = isHidden ? 'Hide' : 'Details';
      if (isHidden) {
        const c = categories.find((x) => x.id === id);
        renderCategoryDetailPanel(id, c);
      }
    });
  });
  tbody.querySelectorAll('[data-move-category]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-move-category');
      const direction = btn.getAttribute('data-direction');
      const current = categories.find((c) => c.id === id);
      if (!current) return;
      // Siblings = same parent_id, in current display order (stable sort,
      // so untouched categories that all still share the schema default
      // sort_order=0 keep whatever order the backend returned them in —
      // typically creation order). Swap the two target positions, then
      // renumber the WHOLE sibling group to sequential 1..N rather than
      // just swapping the two rows' raw sort_order values — that's what
      // makes this self-healing the first time it's used on a group that
      // hasn't been explicitly ordered yet (every row tied at 0, so a
      // naive two-row swap would be a no-op).
      const siblings = categories
        .filter((c) => (c.parent_id || null) === (current.parent_id || null))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const idx = siblings.findIndex((c) => c.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;
      [siblings[idx], siblings[swapIdx]] = [siblings[swapIdx], siblings[idx]];
      await Promise.all(
        siblings
          .map((c, i) => ({ c, newOrder: i + 1 }))
          .filter(({ c, newOrder }) => (c.sort_order || 0) !== newOrder)
          .map(({ c, newOrder }) => api(`/api/categories/${c.id}`, { method: 'PATCH', body: { sort_order: newOrder } }))
      );
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

// Admin Phase 5: category description/image/active/SEO fields — previously
// only name/slug/parent/sort_order existed. Same per-row expandable-panel
// pattern as Products/Customers/Orders rather than a separate page.
async function renderCategoryDetailPanel(categoryId, category) {
  const panel = document.querySelector(`[data-category-detail-panel="${categoryId}"]`);
  panel.innerHTML = `
    <div style="max-width:520px;">
      <div class="form-field">
        <label>Image</label>
        <div style="display:flex;gap:12px;align-items:center;">
          <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:var(--sand-100);flex-shrink:0;">
            ${category.image_url ? `<img data-category-image-preview src="${category.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;" />` : '<span data-category-image-preview style="font-size:0.65rem;color:var(--moss-700);">No image</span>'}
          </div>
          <input type="file" accept="image/*" data-category-image-file />
        </div>
      </div>
      <div class="form-field">
        <label for="cat-desc-${categoryId}">Description</label>
        <textarea id="cat-desc-${categoryId}" rows="3" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--sand-300);">${category.description || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-field"><label for="cat-seo-title-${categoryId}">SEO title</label><input id="cat-seo-title-${categoryId}" value="${category.seo_title || ''}" /></div>
      </div>
      <div class="form-field">
        <label for="cat-seo-desc-${categoryId}">SEO meta description</label>
        <textarea id="cat-seo-desc-${categoryId}" rows="2" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--sand-300);">${category.seo_meta_description || ''}</textarea>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <input type="checkbox" data-category-active ${category.is_active !== false ? 'checked' : ''} />
        Active (unchecked hides this category from the storefront's nav/filters — products already in it stay visible on their own product pages)
      </label>
      <button class="btn btn--primary btn--sm" data-category-save="${categoryId}">Save</button>
      <span data-category-save-status style="font-size:0.8rem;color:var(--moss-700);margin-left:8px;"></span>
    </div>
  `;

  let pendingImageUrl = null;
  const fileInput = panel.querySelector('[data-category-image-file]');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    pendingImageUrl = await readFileAsDataUrl(file);
    panel.querySelectorAll('[data-category-image-preview]').forEach((el) => {
      el.outerHTML = `<img data-category-image-preview src="${pendingImageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
    });
  });

  panel.querySelector('[data-category-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const statusEl = panel.querySelector('[data-category-save-status]');
    btn.disabled = true;
    statusEl.textContent = 'Saving…';
    try {
      const patch = {
        description: panel.querySelector(`#cat-desc-${categoryId}`).value.trim() || null,
        seo_title: panel.querySelector(`#cat-seo-title-${categoryId}`).value.trim() || null,
        seo_meta_description: panel.querySelector(`#cat-seo-desc-${categoryId}`).value.trim() || null,
        is_active: panel.querySelector('[data-category-active]').checked,
      };
      if (pendingImageUrl) patch.image_url = pendingImageUrl;
      const { category: updated } = await api(`/api/categories/${categoryId}`, { method: 'PATCH', body: patch });
      Object.assign(category, updated);
      statusEl.textContent = 'Saved.';
      setTimeout(() => (statusEl.textContent = ''), 1500);
      renderCategoriesTab();
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
      statusEl.style.color = '#b91c1c';
    } finally {
      btn.disabled = false;
    }
  });
}

// Customer directory: every account (customer/staff/admin), with order
// count and paid-order spend joined in client-side from /api/orders — same
// pattern as the Reports tab's low-stock/best-seller widgets, rather than
// teaching the backend a new aggregate query for one admin screen.
async function renderCustomersTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading customers…</p>';
  const [{ customers }, { orders }, status] = await Promise.all([
    api('/api/customers'),
    api('/api/orders'),
    api('/api/status', { auth: false }),
  ]);

  const statsByEmail = {};
  orders.forEach((o) => {
    const key = (o.customer_email || '').toLowerCase();
    if (!key) return;
    if (!statsByEmail[key]) statsByEmail[key] = { count: 0, spendPaise: 0 };
    statsByEmail[key].count += 1;
    if (o.payment_status === 'paid') statsByEmail[key].spendPaise += o.total_paise;
  });

  const resetNote = status.supabaseConfigured
    ? "\"Send reset link\" emails the customer a real Supabase password-reset link via Resend."
    : "Demo mode: \"Send reset link\" mints a temporary local reset link (there's no real Supabase account yet) — check the server console if Resend isn't configured, the link is logged there instead of emailed.";

  wrap.innerHTML = `
    <p style="font-size:0.85rem;color:var(--moss-700);margin-top:0;">${resetNote} There's no way to view or set a customer's actual password here — or anywhere else — on purpose; this only ever sends them a link to set a new one themselves.</p>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Groove Points</th><th></th></tr></thead>
        <tbody>
          ${
            customers.length
              ? customers
                  .map((c) => {
                    const stats = statsByEmail[(c.email || '').toLowerCase()] || { count: 0, spendPaise: 0 };
                    return `
                    <tr data-customer-email="${c.email}" style="${c.is_active === false ? 'opacity:0.6;' : ''}">
                      <td>${c.full_name || '—'}${c.is_active === false ? ' <span class="status-pill status-cancelled" style="margin-left:4px;">Deactivated</span>' : ''}</td>
                      <td>${c.email}</td>
                      <td><span class="status-pill status-${c.role === 'admin' ? 'delivered' : c.role === 'staff' ? 'shipped' : 'placed'}">${c.role}</span></td>
                      <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                      <td>${stats.count}</td>
                      <td class="mono">${formatRupees(stats.spendPaise)}</td>
                      <td class="mono" data-points-cell>${c.loyalty_points || 0}</td>
                      <td style="white-space:nowrap;display:flex;gap:6px;flex-wrap:wrap;">
                        <button class="btn btn--outline btn--sm" data-toggle-customer-detail="${c.id}">Details</button>
                        <button class="btn btn--outline btn--sm" data-send-reset="${c.email}">Send reset link</button>
                        <button class="btn btn--outline btn--sm" data-adjust-points="${c.id}">Adjust points</button>
                        ${c.role === 'customer' ? `<button class="btn btn--outline btn--sm" data-impersonate="${c.id}" data-impersonate-email="${c.email}">Log in as</button>` : ''}
                      </td>
                    </tr>
                    <tr class="variants-row" data-customer-detail-for="${c.id}" style="display:none;">
                      <td colspan="8"><div class="variants-panel" data-customer-detail-panel="${c.id}"></div></td>
                    </tr>`;
                  })
                  .join('')
              : '<tr><td colspan="8" style="color:var(--moss-700);">No customers yet.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-toggle-customer-detail]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-customer-detail');
      const row = wrap.querySelector(`[data-customer-detail-for="${id}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      btn.textContent = isHidden ? 'Hide' : 'Details';
      if (isHidden) {
        const c = customers.find((x) => x.id === id);
        const stats = statsByEmail[(c.email || '').toLowerCase()] || { count: 0, spendPaise: 0 };
        renderCustomerDetailPanel(id, c, stats);
      }
    });
  });

  wrap.querySelectorAll('[data-send-reset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-send-reset');
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Sending…';
      try {
        await api('/api/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
        btn.textContent = 'Sent';
      } catch (err) {
        btn.textContent = originalLabel;
        btn.disabled = false;
        alert(err.message || 'Could not send the reset link.');
      }
    });
  });

  // Real form (points + a mandatory reason note), not a bare prompt() — the
  // previous version took no reason at all and the backend hardcoded one.
  // Opens inline in place of the button rather than a separate modal system,
  // since this table has no existing expand-row wiring to hook into.
  function openAdjustPointsForm(cell, id) {
    const originalHtml = cell.innerHTML;
    cell.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;min-width:200px;">
        <div style="display:flex;gap:4px;">
          <input type="number" placeholder="± points" data-pa-delta style="width:80px;padding:5px;border-radius:6px;border:1px solid var(--sand-300);" />
          <input type="text" placeholder="Reason (required)" data-pa-reason style="flex:1;padding:5px;border-radius:6px;border:1px solid var(--sand-300);" />
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn--primary btn--sm" data-pa-confirm>Save</button>
          <button class="btn btn--outline btn--sm" data-pa-cancel>Cancel</button>
        </div>
        <span class="form-error" data-pa-error style="display:none;font-size:0.75rem;"></span>
      </div>
    `;
    cell.querySelector('[data-pa-cancel]').addEventListener('click', () => {
      cell.innerHTML = originalHtml;
      wireAdjustPointsButton(cell, id);
    });
    cell.querySelector('[data-pa-confirm]').addEventListener('click', async () => {
      const delta = Number(cell.querySelector('[data-pa-delta]').value);
      const note = cell.querySelector('[data-pa-reason]').value.trim();
      const errorEl = cell.querySelector('[data-pa-error]');
      errorEl.style.display = 'none';
      if (!delta) {
        errorEl.textContent = 'Enter a non-zero number of points.';
        errorEl.style.display = 'block';
        return;
      }
      if (!note) {
        errorEl.textContent = 'A reason is required.';
        errorEl.style.display = 'block';
        return;
      }
      try {
        const { balance } = await api(`/api/customers/${id}/points/adjust`, { method: 'POST', body: { delta, note } });
        const row = cell.closest('tr');
        const pointsCell = row.querySelector('[data-points-cell]');
        if (pointsCell) pointsCell.textContent = balance;
        cell.innerHTML = originalHtml;
        wireAdjustPointsButton(cell, id);
      } catch (err) {
        errorEl.textContent = err.message || 'Could not adjust points.';
        errorEl.style.display = 'block';
      }
    });
  }

  function wireAdjustPointsButton(cell, id) {
    const btn = cell.querySelector(`[data-adjust-points="${id}"]`);
    if (btn) btn.addEventListener('click', () => openAdjustPointsForm(cell, id));
  }

  wrap.querySelectorAll('[data-adjust-points]').forEach((btn) => {
    const id = btn.getAttribute('data-adjust-points');
    btn.addEventListener('click', () => openAdjustPointsForm(btn.parentElement, id));
  });

  wrap.querySelectorAll('[data-impersonate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-impersonate');
      const email = btn.getAttribute('data-impersonate-email');
      if (!confirm(`Open the storefront signed in as ${email}? This opens in a new tab — your admin session here is unaffected.`)) return;
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Opening…';
      try {
        // Both live Supabase mode and demo mode return the same shape —
        // { token } — the actual sign-in (magic-link OTP verified
        // server-side, or a local demo session) already happened inside
        // POST /api/customers/:id/impersonate. impersonate-callback.html
        // only ever reads `token`, so there's nothing mode-specific left
        // to branch on here (the old `result.mode === 'supabase'` /
        // `result.actionLink` branch was dead — the backend hasn't sent
        // that shape since the redirect-allowlist rework, see that
        // route's comments).
        const result = await api(`/api/customers/${id}/impersonate`, { method: 'POST' });
        window.open(`/impersonate-callback?token=${encodeURIComponent(result.token)}`, '_blank');
      } catch (err) {
        alert(err.message || 'Could not sign in as this customer.');
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  });
}

// Customer detail panel (Admin Phase 3) — 7 sub-tabs per the audit's
// customer-detail-page spec: Overview / Orders / Points / Referrals /
// Addresses / Activity / Security. Opened inline below the customer's row
// in the Customers table (same expandable-panel pattern as the Products
// tab), rather than a separate page/drawer, to match the rest of this admin
// and avoid a bigger routing/navigation change for one detail view.
const CUSTOMER_DETAIL_TABS = ['Overview', 'Orders', 'Points', 'Referrals', 'Addresses', 'Activity', 'Security'];

async function renderCustomerDetailPanel(customerId, customer, stats) {
  const panel = document.querySelector(`[data-customer-detail-panel="${customerId}"]`);
  if (!panel) return;
  panel.innerHTML = '<p>Loading…</p>';

  // Fetched once per open, shared across every sub-tab so switching tabs
  // doesn't re-fetch.
  const [{ orders }, { ledger }, { addresses }, referral] = await Promise.all([
    api(`/api/customers/${customerId}/orders`),
    api(`/api/customers/${customerId}/points/ledger`),
    api(`/api/customers/${customerId}/addresses`),
    api(`/api/customers/${customerId}/referral`).catch(() => null),
  ]);

  let activeTab = 'Overview';

  panel.innerHTML = `
    <div class="tab-strip" data-cd-tabs style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
      ${CUSTOMER_DETAIL_TABS.map((t) => `<button type="button" class="btn btn--outline btn--sm" data-cd-tab="${t}">${t}</button>`).join('')}
    </div>
    <div data-cd-content></div>
  `;

  const contentEl = panel.querySelector('[data-cd-content]');

  function setActiveTabStyles() {
    panel.querySelectorAll('[data-cd-tab]').forEach((btn) => {
      const isActive = btn.getAttribute('data-cd-tab') === activeTab;
      btn.classList.toggle('btn--primary', isActive);
      btn.classList.toggle('btn--outline', !isActive);
    });
  }

  function renderOverview() {
    contentEl.innerHTML = `
      <div class="form-row">
        <div class="form-field"><label>Name</label><div>${customer.full_name || '—'}</div></div>
        <div class="form-field"><label>Email</label><div>${customer.email}</div></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Role</label><div>${customer.role}</div></div>
        <div class="form-field"><label>Joined</label><div>${customer.created_at ? new Date(customer.created_at).toLocaleString() : '—'}</div></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Orders / spend</label><div>${stats.count} order${stats.count === 1 ? '' : 's'} — ${formatRupees(stats.spendPaise)}</div></div>
        <div class="form-field"><label>Groove Points balance</label><div class="mono">${customer.loyalty_points || 0}</div></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Account status</label><div>${customer.is_active === false ? `<span class="status-pill status-cancelled">Deactivated</span>${customer.deactivated_reason ? ` — ${escapeAttr(customer.deactivated_reason)}` : ''}` : '<span class="status-pill status-delivered">Active</span>'}</div></div>
        <div class="form-field"><label>Referral code</label><div class="mono">${(referral && referral.code) || '—'}</div></div>
      </div>
    `;
  }

  function renderOrders() {
    contentEl.innerHTML = orders.length
      ? `<table class="data-table">
          <thead><tr><th>Order #</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
          <tbody>
            ${orders
              .map(
                (o) => `<tr>
                  <td class="mono">${o.order_number}</td>
                  <td>${new Date(o.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td><span class="status-pill status-${o.status}">${o.status}</span></td>
                  <td>${o.payment_status}</td>
                  <td class="mono">${formatRupees(o.total_paise)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`
      : '<p style="color:var(--moss-700);">No orders yet.</p>';
  }

  function renderPoints() {
    contentEl.innerHTML = `
      <p><strong>Balance: </strong><span class="mono">${customer.loyalty_points || 0}</span></p>
      <table class="data-table">
        <thead><tr><th>When</th><th>Change</th><th>Reason</th><th>Note</th></tr></thead>
        <tbody>
          ${
            ledger.length
              ? ledger
                  .map(
                    (l) => `<tr>
                      <td>${new Date(l.created_at).toLocaleString()}</td>
                      <td class="mono" style="color:${l.points_delta > 0 ? 'var(--moss-700)' : 'var(--clay-500)'};">${l.points_delta > 0 ? '+' : ''}${l.points_delta}</td>
                      <td>${l.reason}</td>
                      <td>${l.note ? escapeAttr(l.note) : '—'}</td>
                    </tr>`
                  )
                  .join('')
              : '<tr><td colspan="4" style="color:var(--moss-700);">No points activity yet.</td></tr>'
          }
        </tbody>
      </table>
    `;
  }

  function renderReferrals() {
    if (!referral) {
      contentEl.innerHTML = '<p style="color:var(--moss-700);">Could not load referral data.</p>';
      return;
    }
    const friends = referral.referrals || [];
    contentEl.innerHTML = `
      <div class="form-row">
        <div class="form-field"><label>Their referral code</label><div class="mono">${referral.code || '—'}</div></div>
        <div class="form-field"><label>Referred by</label><div>${referral.referredBy ? `${referral.referredBy.full_name || referral.referredBy.email || referral.referredBy.id}` : '— (not referred by anyone)'}</div></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Friends referred</label><div>${referral.referredCount || 0}</div></div>
        <div class="form-field"><label>Points earned from referrals</label><div class="mono">${referral.pointsFromReferrals || 0}</div></div>
      </div>
      <h4 style="margin-top:16px;">Referred friends</h4>
      ${
        friends.length
          ? `<table class="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Points earned</th></tr></thead>
              <tbody>
                ${friends
                  .map(
                    (f) => `<tr>
                      <td>${f.full_name || '—'}</td>
                      <td>${f.email || '—'}</td>
                      <td>${f.joined_at ? new Date(f.joined_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                      <td>${f.orderCount != null ? f.orderCount : '—'}</td>
                      <td class="mono">${f.totalSpentPaise != null ? formatRupees(f.totalSpentPaise) : '—'}</td>
                      <td class="mono">${f.pointsEarnedFromThisFriend != null ? f.pointsEarnedFromThisFriend : '—'}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p style="color:var(--moss-700);">No friends referred yet.</p>'
      }
    `;
  }

  function renderAddresses() {
    contentEl.innerHTML = addresses.length
      ? `<div style="display:flex;flex-direction:column;gap:10px;">
          ${addresses
            .map(
              (a) => `<div class="card" style="padding:12px;">
                <div><strong>${a.label || 'Address'}</strong>${a.is_default ? ' <span class="status-pill status-delivered">Default</span>' : ''}</div>
                <div>${[a.line1, a.line2].filter(Boolean).join(', ')}</div>
                <div>${[a.city, a.state, a.pincode].filter(Boolean).join(', ')}</div>
                <div>${a.phone || ''}</div>
              </div>`
            )
            .join('')}
        </div>`
      : '<p style="color:var(--moss-700);">No saved addresses.</p>';
  }

  function renderActivity() {
    // A lightweight timeline, not a full audit log (that's Admin Phase 6's
    // job — every admin write action instrumented). This merges the two
    // event streams already fetched for this panel (orders placed, points
    // ledger entries) into one chronological view — genuinely useful today
    // without overclaiming what it is.
    const events = [
      ...orders.map((o) => ({ at: o.created_at, label: `Order ${o.order_number} placed (${formatRupees(o.total_paise)}, ${o.status})` })),
      ...ledger.map((l) => ({ at: l.created_at, label: `Groove Points ${l.points_delta > 0 ? '+' : ''}${l.points_delta} — ${l.reason}${l.note ? ` (${l.note})` : ''}` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    contentEl.innerHTML = events.length
      ? `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
          ${events.map((e) => `<li style="border-left:2px solid var(--sand-300);padding-left:10px;"><span style="color:var(--moss-700);font-size:0.78rem;">${new Date(e.at).toLocaleString()}</span><br/>${escapeAttr(e.label)}</li>`).join('')}
        </ul>
        <p style="font-size:0.78rem;color:var(--moss-700);margin-top:10px;">Orders and Groove Points activity only — a full action-by-action audit log across the admin isn't built yet.</p>`
      : '<p style="color:var(--moss-700);">No activity yet.</p>';
  }

  function renderSecurity() {
    contentEl.innerHTML = `
      <div class="form-field">
        <label>Account status</label>
        <div>${customer.is_active === false ? `<span class="status-pill status-cancelled">Deactivated</span>${customer.deactivated_reason ? ` — ${escapeAttr(customer.deactivated_reason)}` : ''}${customer.deactivated_at ? ` (${new Date(customer.deactivated_at).toLocaleString()})` : ''}` : '<span class="status-pill status-delivered">Active</span>'}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <button class="btn btn--outline btn--sm" data-cd-send-reset>Send reset link</button>
        ${
          customer.role === 'admin'
            ? '<span style="font-size:0.78rem;color:var(--moss-700);align-self:center;">Admin accounts can\'t be deactivated from here.</span>'
            : customer.is_active === false
              ? '<button class="btn btn--primary btn--sm" data-cd-reactivate>Reactivate account</button>'
              : '<button class="btn btn--outline btn--sm" data-cd-deactivate>Deactivate account</button>'
        }
      </div>
      <p class="form-error" data-cd-security-error style="display:none;"></p>
      <p class="form-error" data-cd-security-ok style="display:none;color:var(--moss-700);"></p>
    `;
    const sendResetBtn = contentEl.querySelector('[data-cd-send-reset]');
    if (sendResetBtn) {
      sendResetBtn.addEventListener('click', async () => {
        sendResetBtn.disabled = true;
        const original = sendResetBtn.textContent;
        sendResetBtn.textContent = 'Sending…';
        try {
          await api('/api/auth/forgot-password', { method: 'POST', auth: false, body: { email: customer.email } });
          sendResetBtn.textContent = 'Sent';
        } catch (err) {
          sendResetBtn.textContent = original;
          sendResetBtn.disabled = false;
          alert(err.message || 'Could not send the reset link.');
        }
      });
    }
    const deactivateBtn = contentEl.querySelector('[data-cd-deactivate]');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', async () => {
        const reason = prompt(`Deactivate ${customer.email}? Enter a reason (shown in their account record):`);
        if (reason === null) return; // cancelled
        const errorEl = contentEl.querySelector('[data-cd-security-error]');
        errorEl.style.display = 'none';
        try {
          const { customer: updated } = await api(`/api/customers/${customerId}/status`, { method: 'PATCH', body: { is_active: false, reason } });
          Object.assign(customer, updated);
          renderSecurity();
          renderOverview();
          renderCustomersTab(); // refresh the row's Deactivated badge in the main table
        } catch (err) {
          errorEl.textContent = err.message || 'Could not deactivate this account.';
          errorEl.style.display = 'block';
        }
      });
    }
    const reactivateBtn = contentEl.querySelector('[data-cd-reactivate]');
    if (reactivateBtn) {
      reactivateBtn.addEventListener('click', async () => {
        const errorEl = contentEl.querySelector('[data-cd-security-error]');
        errorEl.style.display = 'none';
        try {
          const { customer: updated } = await api(`/api/customers/${customerId}/status`, { method: 'PATCH', body: { is_active: true } });
          Object.assign(customer, updated);
          renderSecurity();
          renderOverview();
          renderCustomersTab();
        } catch (err) {
          errorEl.textContent = err.message || 'Could not reactivate this account.';
          errorEl.style.display = 'block';
        }
      });
    }
  }

  const RENDERERS = {
    Overview: renderOverview,
    Orders: renderOrders,
    Points: renderPoints,
    Referrals: renderReferrals,
    Addresses: renderAddresses,
    Activity: renderActivity,
    Security: renderSecurity,
  };

  panel.querySelectorAll('[data-cd-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-cd-tab');
      setActiveTabStyles();
      RENDERERS[activeTab]();
    });
  });

  setActiveTabStyles();
  renderOverview();
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
        <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Tax</th><th>Payment</th><th>Status</th><th>Tracking</th><th>Invoice</th><th></th></tr></thead>
        <tbody>
          ${orders
            .map(
              (o) => `
            <tr data-id="${o.id}">
              <td class="mono">${o.order_number}</td>
              <td>${o.customer_name}<br /><span style="font-size:0.78rem;opacity:0.6;">${o.customer_email}</span></td>
              <td class="mono">${formatRupees(o.total_paise)}${o.discount_paise ? `<br /><span style="font-size:0.75rem;color:var(--moss-700);">−${formatRupees(o.discount_paise)} (${o.coupon_code || 'coupon'})</span>` : ''}${o.refunded_amount_paise ? `<br /><span style="font-size:0.75rem;color:#b45309;">−${formatRupees(o.refunded_amount_paise)} refunded</span>` : ''}</td>
              <td style="font-size:0.78rem;">
                ${
                  o.cgst_paise || o.sgst_paise
                    ? `CGST ${formatRupees(o.cgst_paise || 0)}<br />SGST ${formatRupees(o.sgst_paise || 0)}`
                    : o.igst_paise
                    ? `IGST ${formatRupees(o.igst_paise)}`
                    : o.gst_paise
                    ? `GST ${formatRupees(o.gst_paise)}`
                    : '—'
                }
                ${o.customer_state ? `<br /><span style="opacity:0.6;">${o.customer_state}${o.tax_type === 'interstate' ? ' (interstate)' : ''}</span>` : ''}
              </td>
              <td>
                <span class="status-pill status-${o.payment_status === 'paid' ? 'delivered' : 'placed'}">${o.payment_status}</span>
                <div style="font-size:0.75rem;color:var(--moss-700);">${o.payment_gateway || '—'}</div>
                ${o.payment_gateway === 'cod' && o.payment_status !== 'paid' ? `<button class="btn btn--outline btn--sm" data-mark-cod-paid="${o.id}" style="margin-top:4px;">Mark COD Paid</button>` : ''}
              </td>
              <td>
                <select data-status="${o.id}">
                  ${['placed', 'packed', 'shipped', 'delivered', 'cancelled']
                    .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
              </td>
              <td>
                <input placeholder="Tracking number" data-tracking-number="${o.id}" value="${o.tracking_number || ''}" style="width:120px;padding:4px;border-radius:6px;border:1px solid var(--sand-300);font-size:0.78rem;margin-bottom:4px;" /><br />
                <input placeholder="Tracking URL" data-tracking-url="${o.id}" value="${o.tracking_url || ''}" style="width:120px;padding:4px;border-radius:6px;border:1px solid var(--sand-300);font-size:0.78rem;margin-bottom:4px;" /><br />
                <button class="btn btn--outline btn--sm" data-save-tracking="${o.id}">Save</button>
              </td>
              <td><a href="#" onclick="openInvoicePdf('${o.id}'); return false;">PDF</a></td>
              <td><button class="btn btn--outline btn--sm" data-toggle-order-detail="${o.id}">Details</button></td>
            </tr>
            <tr class="variants-row" data-order-detail-for="${o.id}" style="display:none;">
              <td colspan="9"><div class="variants-panel" data-order-detail-panel="${o.id}"></div></td>
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
  wrap.querySelectorAll('[data-mark-cod-paid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirm cash was collected for this order?')) return;
      await api(`/api/orders/${btn.getAttribute('data-mark-cod-paid')}/mark-cod-paid`, { method: 'PATCH' });
      renderOrdersTab();
    });
  });
  wrap.querySelectorAll('[data-save-tracking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-save-tracking');
      const trackingNumber = wrap.querySelector(`[data-tracking-number="${id}"]`).value.trim();
      const trackingUrl = wrap.querySelector(`[data-tracking-url="${id}"]`).value.trim();
      await api(`/api/orders/${id}/tracking`, { method: 'PATCH', body: { trackingNumber, trackingUrl } });
      btn.textContent = 'Saved';
      setTimeout(() => (btn.textContent = 'Save'), 1500);
    });
  });
  wrap.querySelectorAll('[data-toggle-order-detail]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-order-detail');
      const row = wrap.querySelector(`[data-order-detail-for="${id}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      btn.textContent = isHidden ? 'Hide' : 'Details';
      if (isHidden) {
        const o = orders.find((x) => x.id === id);
        renderOrderDetailPanel(id, o);
      }
    });
  });
}

const ORDER_EVENT_LABELS = {
  status_change: 'Status changed',
  tracking_added: 'Tracking added',
  payment_marked_paid: 'Payment marked paid',
  refund_requested: 'Refund requested',
  refund_processed: 'Refund processed',
  refund_rejected: 'Refund rejected',
  note: 'Note',
};

function formatOrderEventTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Admin Phase 4: Order Detail panel — full timeline (order_status_events)
// plus the refund/return/cancellation workflow (order_refunds). Reuses the
// same per-row expandable-panel pattern as Products/Customers rather than a
// separate order-detail page, matching the rest of this admin build.
async function renderOrderDetailPanel(orderId, order) {
  const panel = document.querySelector(`[data-order-detail-panel="${orderId}"]`);
  panel.innerHTML = '<p>Loading order detail…</p>';

  let events = [];
  let refunds = [];
  try {
    const [eventsRes, refundsRes] = await Promise.all([
      api(`/api/orders/${orderId}/events`),
      api(`/api/orders/${orderId}/refunds`),
    ]);
    events = eventsRes.events || [];
    refunds = refundsRes.refunds || [];
  } catch (err) {
    panel.innerHTML = `<div class="empty-state">${err.message || "Couldn't load order detail."}</div>`;
    return;
  }

  const refundedSoFar = order.refunded_amount_paise || 0;
  const remaining = Math.max(0, (order.total_paise || 0) - refundedSoFar);

  function render() {
    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
        <div>
          <h4 style="margin-top:0;">Timeline</h4>
          ${
            events.length
              ? `<table class="data-table" style="font-size:0.82rem;">
                  <thead><tr><th>When</th><th>Event</th><th>Detail</th><th>By</th></tr></thead>
                  <tbody>
                    ${events
                      .map(
                        (e) => `<tr>
                          <td style="white-space:nowrap;">${formatOrderEventTime(e.created_at)}</td>
                          <td>${ORDER_EVENT_LABELS[e.event_type] || e.event_type}</td>
                          <td>${e.from_value || e.to_value ? `${e.from_value ? `${e.from_value} → ` : ''}${e.to_value || ''}` : '—'}${e.note ? `<br /><span style="opacity:0.7;">${e.note}</span>` : ''}</td>
                          <td>${e.actor || '—'}</td>
                        </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
              : '<p style="color:var(--moss-700);font-size:0.85rem;">No events recorded yet.</p>'
          }
        </div>
        <div>
          <h4 style="margin-top:0;">Refunds / returns / cancellations</h4>
          <p style="font-size:0.82rem;color:var(--moss-700);margin-top:-6px;">
            Order total: <strong class="mono">${formatRupees(order.total_paise)}</strong> ·
            Refunded so far: <strong class="mono">${formatRupees(refundedSoFar)}</strong> ·
            Refundable remaining: <strong class="mono">${formatRupees(remaining)}</strong>
          </p>
          ${
            refunds.length
              ? `<table class="data-table" style="font-size:0.82rem;">
                  <thead><tr><th>Type</th><th>Amount</th><th>Reason</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    ${refunds
                      .map(
                        (r) => `<tr data-refund-id="${r.id}">
                          <td>${r.type}</td>
                          <td class="mono">${formatRupees(r.amount_paise)}</td>
                          <td>${r.reason}${r.note ? `<br /><span style="opacity:0.7;">${r.note}</span>` : ''}</td>
                          <td><span class="status-pill status-${r.status === 'processed' ? 'delivered' : r.status === 'rejected' ? 'cancelled' : 'placed'}">${r.status}</span></td>
                          <td style="white-space:nowrap;">
                            ${
                              r.status === 'requested'
                                ? `<button class="btn btn--outline btn--sm" data-refund-action="processed" data-refund-id="${r.id}">Process</button>
                                   <button class="btn btn--outline btn--sm" data-refund-action="rejected" data-refund-id="${r.id}">Reject</button>`
                                : `<span style="opacity:0.6;">${r.processed_by || ''}</span>`
                            }
                          </td>
                        </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
              : '<p style="color:var(--moss-700);font-size:0.85rem;">No refund requests yet.</p>'
          }
          ${
            remaining > 0
              ? `<div class="card" style="margin-top:10px;padding:10px;">
                  <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Request a refund</div>
                  <select data-new-refund-type style="width:100%;margin-bottom:6px;">
                    <option value="refund">Refund</option>
                    <option value="cancellation">Cancellation</option>
                    <option value="return">Return</option>
                  </select>
                  <input type="number" step="0.01" min="0" placeholder="Amount (₹)" data-new-refund-amount style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--sand-300);margin-bottom:6px;" />
                  <input type="text" placeholder="Reason (required)" data-new-refund-reason style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--sand-300);margin-bottom:6px;" />
                  <textarea placeholder="Note (optional)" data-new-refund-note style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--sand-300);margin-bottom:6px;" rows="2"></textarea>
                  <button class="btn btn--primary btn--sm" data-new-refund-submit>Submit request</button>
                  <div data-new-refund-error style="color:#b91c1c;font-size:0.8rem;margin-top:6px;display:none;"></div>
                </div>`
              : ''
          }
        </div>
      </div>
    `;

    panel.querySelectorAll('[data-refund-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const status = btn.getAttribute('data-refund-action');
        const refundId = btn.getAttribute('data-refund-id');
        if (status === 'rejected' && !confirm('Reject this refund request?')) return;
        if (status === 'processed' && !confirm('Mark this refund as processed? This records that the money has actually been sent back to the customer.')) return;
        try {
          await api(`/api/orders/${orderId}/refunds/${refundId}`, { method: 'PATCH', body: { status } });
          const [eventsRes, refundsRes, ordersRes] = await Promise.all([
            api(`/api/orders/${orderId}/events`),
            api(`/api/orders/${orderId}/refunds`),
            api('/api/orders'),
          ]);
          events = eventsRes.events || [];
          refunds = refundsRes.refunds || [];
          const fresh = (ordersRes.orders || []).find((x) => x.id === orderId);
          if (fresh) order = fresh;
          render();
        } catch (err) {
          alert(err.message || 'Could not update this refund.');
        }
      });
    });

    const submitBtn = panel.querySelector('[data-new-refund-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const errorEl = panel.querySelector('[data-new-refund-error]');
        errorEl.style.display = 'none';
        const type = panel.querySelector('[data-new-refund-type]').value;
        const rupees = Number(panel.querySelector('[data-new-refund-amount]').value);
        const reason = panel.querySelector('[data-new-refund-reason]').value.trim();
        const note = panel.querySelector('[data-new-refund-note]').value.trim();
        if (!rupees || !Number.isFinite(rupees) || rupees <= 0) {
          errorEl.textContent = 'Enter a valid refund amount.';
          errorEl.style.display = 'block';
          return;
        }
        if (!reason) {
          errorEl.textContent = 'A reason is required.';
          errorEl.style.display = 'block';
          return;
        }
        try {
          await api(`/api/orders/${orderId}/refunds`, {
            method: 'POST',
            body: { type, amountPaise: Math.round(rupees * 100), reason, note: note || null },
          });
          const [eventsRes, refundsRes] = await Promise.all([
            api(`/api/orders/${orderId}/events`),
            api(`/api/orders/${orderId}/refunds`),
          ]);
          events = eventsRes.events || [];
          refunds = refundsRes.refunds || [];
          render();
        } catch (err) {
          errorEl.textContent = err.message || 'Could not submit this refund request.';
          errorEl.style.display = 'block';
        }
      });
    }
  }

  render();
}

// Placements the storefront currently knows how to display. The database
// column is plain text (not an enum) so this list can grow later without a
// migration — just add an <option> here and teach the frontend to read it.
const BANNER_PLACEMENTS = [
  { value: 'homepage_hero', label: 'Homepage Hero (top rotating slider)' },
  { value: 'homepage_promo', label: 'Homepage Promo / Festive Offer Card' },
  { value: 'sitewide_announcement', label: 'Sitewide Announcement Strip' },
];

// Draft/Scheduled/Active/Expired — computed server-side (dataStore.js
// computeBannerStatus) from is_active + scheduled_start/scheduled_end.
const BANNER_STATUS_META = {
  draft: { label: 'Draft', pill: 'status-draft' },
  scheduled: { label: 'Scheduled', pill: 'status-scheduled' },
  active: { label: 'Active', pill: 'status-active' },
  expired: { label: 'Expired', pill: 'status-expired' },
};

// Live-preview width presets for the crop/zoom editor. MOBILE_BREAKPOINT_PX
// must match the swap point the real homepage uses (frontend/js/home-content.js
// — window.matchMedia('(max-width: 768px)')), so a width toggled here shows
// exactly the crop that width would actually get on the live site.
const MOBILE_BREAKPOINT_PX = 768;
const PREVIEW_WIDTHS = [
  { key: 'desktop', label: 'Desktop', px: 1440 },
  { key: 'laptop', label: 'Laptop', px: 1024 },
  { key: 'tablet', label: 'Tablet', px: 768 },
  { key: 'mobile', label: 'Mobile', px: 390 },
  { key: 'small', label: 'Small phone', px: 320 },
];

function placementLabel(value) {
  const found = BANNER_PLACEMENTS.find((p) => p.value === value);
  return found ? found.label : value;
}

function bannerEscapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// <input type="datetime-local"> <-> ISO string, both directions tolerate
// empty/invalid input by returning '' / null (an unset schedule bound).
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function datetimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatScheduleRange(b) {
  if (!b.scheduled_start && !b.scheduled_end) return '—';
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${b.scheduled_start ? fmt(b.scheduled_start) : 'now'} → ${b.scheduled_end ? fmt(b.scheduled_end) : 'no end'}`;
}

// Reusable drag-to-reposition + zoom-slider crop tool. Mounts into
// `container`; the math it applies (object-position % + transform:scale
// around that same point) is exactly what the live site applies to its
// background-image banners (background-position + transform:scale/-origin
// via --banner-focus-x/-y/--banner-zoom — see .hero__slide in style.css), so
// what's shown here is what ships.
function mountCropTool(container, { imageUrl, focusX = 50, focusY = 50, zoom = 1, onChange }) {
  const state = { focusX, focusY, zoom };
  container.innerHTML = `
    <div class="crop-tool">
      <div class="crop-tool__stage" style="aspect-ratio:16/9;">
        ${imageUrl ? `<img class="crop-tool__img" src="${imageUrl}" draggable="false" alt="" />` : ''}
        <div class="crop-tool__crosshair"></div>
      </div>
      <div class="crop-tool__zoom">
        <span>Zoom</span>
        <input type="range" min="100" max="300" step="1" value="${Math.round(zoom * 100)}" />
        <span class="crop-zoom-readout mono">${zoom.toFixed(2)}x</span>
      </div>
      <p class="crop-tool__hint">Drag the image to reposition the focal point — this is exactly how it'll be framed on the site.</p>
    </div>
  `;
  const stage = container.querySelector('.crop-tool__stage');
  const crosshair = container.querySelector('.crop-tool__crosshair');
  const zoomInput = container.querySelector('input[type="range"]');
  const zoomReadout = container.querySelector('.crop-zoom-readout');
  let img = container.querySelector('.crop-tool__img');

  function apply() {
    if (img) {
      img.style.objectFit = 'cover';
      img.style.objectPosition = `${state.focusX}% ${state.focusY}%`;
      img.style.transform = `scale(${state.zoom})`;
      img.style.transformOrigin = `${state.focusX}% ${state.focusY}%`;
    }
    crosshair.style.left = `${state.focusX}%`;
    crosshair.style.top = `${state.focusY}%`;
    zoomReadout.textContent = `${state.zoom.toFixed(2)}x`;
  }
  apply();

  function pointFromEvent(e) {
    const rect = stage.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }
  function movePoint(e) {
    const p = pointFromEvent(e);
    state.focusX = Math.round(p.x * 10) / 10;
    state.focusY = Math.round(p.y * 10) / 10;
    apply();
    if (onChange) onChange({ ...state });
  }
  let dragging = false;
  stage.addEventListener('pointerdown', (e) => {
    if (!img) return;
    dragging = true;
    stage.classList.add('is-panning');
    stage.setPointerCapture(e.pointerId);
    movePoint(e);
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) movePoint(e); });
  const stopDrag = (e) => {
    dragging = false;
    stage.classList.remove('is-panning');
    try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ }
  };
  stage.addEventListener('pointerup', stopDrag);
  stage.addEventListener('pointerleave', stopDrag);
  zoomInput.addEventListener('input', () => {
    state.zoom = parseInt(zoomInput.value, 10) / 100;
    apply();
    if (onChange) onChange({ ...state });
  });

  return {
    getState() { return { ...state }; },
    setImage(url) {
      if (!img) {
        stage.insertAdjacentHTML('afterbegin', `<img class="crop-tool__img" src="${url}" draggable="false" alt="" />`);
        img = stage.querySelector('.crop-tool__img');
      } else {
        img.src = url;
      }
      apply();
    },
  };
}

// Module-level so filters/selection survive a re-render triggered from
// inside the tab (e.g. after a reorder or bulk action), but reset whenever
// the tab is opened fresh from the dashboard nav.
let bannerFilters = { search: '', placement: '', status: '' };
let bannerSelected = new Set();
let bannerAllCache = [];

function filteredBanners() {
  const q = bannerFilters.search.trim().toLowerCase();
  return bannerAllCache.filter((b) => {
    if (bannerFilters.placement && b.placement !== bannerFilters.placement) return false;
    if (bannerFilters.status && b.status !== bannerFilters.status) return false;
    if (q && !`${b.title || ''} ${b.subtitle || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

async function renderBannersTab() {
  bannerFilters = { search: '', placement: '', status: '' };
  bannerSelected = new Set();
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading banners…</p>';
  const { banners } = await api('/api/banners');
  bannerAllCache = banners;

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:20px;" id="banner-editor-card"></div>
    <div class="card">
      <div class="banner-toolbar">
        <input type="search" id="banner-search" placeholder="Search title or subtitle…" style="min-width:220px;" />
        <select id="banner-filter-placement">
          <option value="">All placements</option>
          ${BANNER_PLACEMENTS.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')}
        </select>
        <select id="banner-filter-status">
          <option value="">All statuses</option>
          ${Object.entries(BANNER_STATUS_META).map(([key, meta]) => `<option value="${key}">${meta.label}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <button class="btn btn--primary btn--sm" id="banner-add-btn">+ Add banner</button>
      </div>
      <div id="banner-bulk-bar"></div>
      <div id="banner-table-wrap"></div>
    </div>
  `;

  renderBannerEditor(null); // closed/empty by default

  document.getElementById('banner-search').addEventListener('input', (e) => {
    bannerFilters.search = e.target.value;
    renderBannerTable();
  });
  document.getElementById('banner-filter-placement').addEventListener('change', (e) => {
    bannerFilters.placement = e.target.value;
    renderBannerTable();
  });
  document.getElementById('banner-filter-status').addEventListener('change', (e) => {
    bannerFilters.status = e.target.value;
    renderBannerTable();
  });
  document.getElementById('banner-add-btn').addEventListener('click', () => renderBannerEditor({}));

  renderBannerTable();
}

function renderBannerBulkBar() {
  const bar = document.getElementById('banner-bulk-bar');
  if (!bar) return;
  if (!bannerSelected.size) {
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = `
    <div class="bulk-bar">
      <strong>${bannerSelected.size} selected</strong>
      <span class="spacer"></span>
      <button class="btn btn--outline btn--sm" data-bulk="activate" style="color:inherit;border-color:rgba(255,255,255,0.5);">Activate</button>
      <button class="btn btn--outline btn--sm" data-bulk="deactivate" style="color:inherit;border-color:rgba(255,255,255,0.5);">Set to Draft</button>
      <button class="btn btn--outline btn--sm" data-bulk="delete" style="color:inherit;border-color:rgba(255,255,255,0.5);">Delete</button>
    </div>
  `;
  bar.querySelectorAll('[data-bulk]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-bulk');
      const ids = [...bannerSelected];
      if (action === 'delete' && !confirm(`Delete ${ids.length} banner(s)? This can't be undone.`)) return;
      try {
        await api('/api/banners/bulk', { method: 'POST', body: { ids, action } });
        bannerSelected = new Set();
        const { banners } = await api('/api/banners');
        bannerAllCache = banners;
        renderBannerTable();
      } catch (err) {
        // This used to fail silently (no try/catch at all) — a server error
        // just left the selection and table looking untouched with nothing
        // to explain why. Surface it instead.
        alert(err.message || 'Could not complete that bulk action.');
      }
    });
  });
}

function renderBannerTable() {
  const tableWrap = document.getElementById('banner-table-wrap');
  renderBannerBulkBar();
  const items = filteredBanners();
  if (!bannerAllCache.length) {
    tableWrap.innerHTML = '<div class="empty-state">No banners yet — add one above.</div>';
    return;
  }
  if (!items.length) {
    tableWrap.innerHTML = '<div class="empty-state">No banners match your search/filters.</div>';
    return;
  }

  // Grouped by placement (each group is its own drag-reorder scope, since
  // sort_order is only meaningful within a placement) unless a single
  // placement is already selected, in which case one flat table reads better.
  const groups = {};
  items.forEach((b) => {
    const key = b.placement || 'homepage_hero';
    (groups[key] = groups[key] || []).push(b);
  });

  function bannerRowHtml(b) {
    const meta = BANNER_STATUS_META[b.status] || BANNER_STATUS_META.draft;
    const thumb = b.image_url_mobile || b.image_url;
    return `
      <tr class="banner-row" draggable="true" data-banner-row="${b.id}">
        <td style="width:26px;"><input type="checkbox" data-banner-select="${b.id}" ${bannerSelected.has(b.id) ? 'checked' : ''} /></td>
        <td style="width:22px;"><span class="banner-drag-handle" title="Drag to reorder">⠿</span></td>
        <td><img class="banner-row-thumb" src="${thumb}" alt="" /></td>
        <td>
          <strong>${bannerEscapeHtml(b.title) || 'Untitled'}</strong>
          ${b.subtitle ? `<div style="font-size:0.8rem;color:var(--moss-700);">${bannerEscapeHtml(b.subtitle)}</div>` : ''}
        </td>
        <td><span class="status-pill ${meta.pill}">${meta.label}</span></td>
        <td class="banner-schedule-text">${formatScheduleRange(b)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn--outline btn--sm" data-banner-edit="${b.id}">Edit</button>
            <button class="btn btn--outline btn--sm" data-banner-duplicate="${b.id}">Duplicate</button>
            <button class="btn btn--danger btn--sm" data-banner-delete="${b.id}">Delete</button>
          </div>
        </td>
      </tr>`;
  }

  function tableHtml(rows) {
    return `
      <table class="data-table" style="margin-top:10px;">
        <thead><tr><th></th><th></th><th>Image</th><th>Title</th><th>Status</th><th>Schedule</th><th></th></tr></thead>
        <tbody>${rows.map(bannerRowHtml).join('')}</tbody>
      </table>`;
  }

  if (bannerFilters.placement) {
    tableWrap.innerHTML = tableHtml(items);
  } else {
    tableWrap.innerHTML = Object.entries(groups)
      .map(([placement, rows]) => `<h4 style="margin:20px 0 4px;">${placementLabel(placement)}</h4>${tableHtml(rows)}`)
      .join('');
  }

  wireBannerRowEvents(tableWrap);
}

function wireBannerRowEvents(tableWrap) {
  tableWrap.querySelectorAll('[data-banner-select]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-banner-select');
      if (cb.checked) bannerSelected.add(id); else bannerSelected.delete(id);
      renderBannerBulkBar();
    });
  });
  tableWrap.querySelectorAll('[data-banner-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const banner = bannerAllCache.find((b) => b.id === btn.getAttribute('data-banner-edit'));
      if (banner) renderBannerEditor(banner);
    });
  });
  tableWrap.querySelectorAll('[data-banner-duplicate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/banners/${btn.getAttribute('data-banner-duplicate')}/duplicate`, { method: 'POST' });
        const { banners } = await api('/api/banners');
        bannerAllCache = banners;
        renderBannerTable();
      } catch (err) {
        alert(err.message || 'Could not duplicate that banner.');
      }
    });
  });
  tableWrap.querySelectorAll('[data-banner-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this banner?')) return;
      try {
        await api(`/api/banners/${btn.getAttribute('data-banner-delete')}`, { method: 'DELETE' });
        const { banners } = await api('/api/banners');
        bannerAllCache = banners;
        bannerSelected.delete(btn.getAttribute('data-banner-delete'));
        renderBannerTable();
      } catch (err) {
        // Same silent-failure gap as the bulk-action handler above — a
        // server error (e.g. a role/auth check, or a DB constraint) used to
        // leave the row sitting there with zero feedback. Surface it.
        alert(err.message || 'Could not delete that banner.');
      }
    });
  });

  // Drag-and-drop reorder, scoped to whichever <tbody> the drag started in
  // (i.e. within one placement group) so cross-group drags are a no-op.
  let dragId = null;
  tableWrap.querySelectorAll('tr.banner-row').forEach((row) => {
    row.addEventListener('dragstart', () => {
      dragId = row.getAttribute('data-banner-row');
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      tableWrap.querySelectorAll('.drag-over-top,.drag-over-bottom').forEach((r) => r.classList.remove('drag-over-top', 'drag-over-bottom'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (row.getAttribute('data-banner-row') === dragId) return;
      if (row.parentElement !== tableWrap.querySelector(`tr[data-banner-row="${dragId}"]`)?.parentElement) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      row.classList.toggle('drag-over-top', before);
      row.classList.toggle('drag-over-bottom', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetId = row.getAttribute('data-banner-row');
      const before = row.classList.contains('drag-over-top');
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      if (!dragId || dragId === targetId) return;
      const tbody = row.parentElement;
      if (tbody !== tableWrap.querySelector(`tr[data-banner-row="${dragId}"]`)?.parentElement) return; // different placement group
      const ids = [...tbody.querySelectorAll('tr.banner-row')].map((r) => r.getAttribute('data-banner-row'));
      const from = ids.indexOf(dragId);
      ids.splice(from, 1);
      const to = ids.indexOf(targetId) + (before ? 0 : 1);
      ids.splice(to, 0, dragId);
      try {
        await api('/api/banners/reorder', { method: 'POST', body: { ids } });
        const { banners } = await api('/api/banners');
        bannerAllCache = banners;
        renderBannerTable();
      } catch (err) {
        alert(err.message || 'Could not save the new order.');
        renderBannerTable(); // re-render from the last known-good cache, undoing the visual drag
      }
    });
  });
}

// Add/edit panel. `banner` is {} for a brand-new banner, an existing banner
// object to edit, or null to close/clear the panel.
function renderBannerEditor(banner) {
  const card = document.getElementById('banner-editor-card');
  if (!card) return;
  if (banner === null) {
    card.innerHTML = '';
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  const isEdit = !!banner.id;
  const form = {
    title: banner.title || '',
    subtitle: banner.subtitle || '',
    link_url: banner.link_url || '',
    placement: banner.placement || 'homepage_hero',
    sort_order: banner.sort_order || 1,
    is_active: banner.is_active !== undefined ? banner.is_active : false,
    scheduled_start: banner.scheduled_start || null,
    scheduled_end: banner.scheduled_end || null,
    image_url: banner.image_url || '',
    image_url_mobile: banner.image_url_mobile || '',
    image_focus_x: banner.image_focus_x !== undefined ? banner.image_focus_x : 50,
    image_focus_y: banner.image_focus_y !== undefined ? banner.image_focus_y : 50,
    image_zoom: banner.image_zoom || 1,
    image_focus_x_mobile: banner.image_focus_x_mobile,
    image_focus_y_mobile: banner.image_focus_y_mobile,
    image_zoom_mobile: banner.image_zoom_mobile,
  };
  let activePreviewWidth = 'desktop';

  card.innerHTML = `
    <div class="flex-between">
      <h3 class="mt-0">${isEdit ? 'Edit banner' : 'Add a banner'}</h3>
      <button class="btn btn--outline btn--sm" id="banner-editor-close">Close</button>
    </div>
    <div class="form-row">
      <div class="form-field">
        <label for="be-placement">Where should this appear?</label>
        <select id="be-placement">${BANNER_PLACEMENTS.map((p) => `<option value="${p.value}" ${p.value === form.placement ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
      </div>
      <div class="form-field"><label for="be-sort">Order (lower shows first)</label><input id="be-sort" type="number" min="0" value="${form.sort_order}" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label for="be-title">Title</label><input id="be-title" placeholder="e.g. Diwali Sale" value="${bannerEscapeHtml(form.title)}" /></div>
      <div class="form-field"><label for="be-link">Link (optional)</label><input id="be-link" placeholder="/shop" value="${bannerEscapeHtml(form.link_url)}" /></div>
    </div>
    <div class="form-field"><label for="be-subtitle">Subtitle / offer text (optional)</label><input id="be-subtitle" placeholder="e.g. 20% off, this week only" value="${bannerEscapeHtml(form.subtitle)}" /></div>

    <div class="form-row">
      <div class="form-field">
        <label for="be-start">Scheduled start (optional)</label>
        <input id="be-start" type="datetime-local" value="${isoToDatetimeLocal(form.scheduled_start)}" />
      </div>
      <div class="form-field">
        <label for="be-end">Scheduled end (optional)</label>
        <input id="be-end" type="datetime-local" value="${isoToDatetimeLocal(form.scheduled_end)}" />
      </div>
    </div>
    <p style="font-size:0.8rem;color:var(--moss-700);margin-top:-10px;">
      Leave both blank to publish immediately once switched on. Set a start and/or end to have it go live and expire on its own — status below updates automatically, no need to come back and flip anything.
    </p>
    <label style="font-size:0.85rem;display:flex;align-items:center;gap:8px;margin:10px 0 18px;">
      <input type="checkbox" id="be-active" ${form.is_active ? 'checked' : ''} /> Published (switch off to keep as a Draft)
    </label>

    <div class="form-field">
      <label>Desktop image</label>
      <input id="be-file" type="file" accept="image/*" />
      <div id="be-crop-desktop" style="margin-top:10px;"></div>
    </div>
    <div class="form-field">
      <label>Mobile image (optional — falls back to the desktop image + crop if left blank)</label>
      <input id="be-file-mobile" type="file" accept="image/*" />
      <div id="be-crop-mobile" style="margin-top:10px;"></div>
    </div>

    <div class="form-field">
      <label>Live preview</label>
      <div class="preview-widths">
        ${PREVIEW_WIDTHS.map((w) => `<button type="button" data-preview-width="${w.key}" class="${w.key === activePreviewWidth ? 'active' : ''}">${w.label} (${w.px}px)</button>`).join('')}
      </div>
      <div class="preview-frame" id="be-preview-frame">
        <div class="preview-frame__slide"><img id="be-preview-img" src="" alt="" /></div>
        <div class="preview-frame__caption" id="be-preview-caption"></div>
      </div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;margin-top:8px;">
      <button class="btn btn--primary" id="banner-save-btn">${isEdit ? 'Save changes' : 'Add banner'}</button>
      <button class="btn btn--outline" id="banner-cancel-btn">Cancel</button>
      <p class="form-error" id="banner-editor-error" style="display:none;margin:0;"></p>
    </div>
  `;

  const desktopCropEl = document.getElementById('be-crop-desktop');
  const mobileCropEl = document.getElementById('be-crop-mobile');
  let desktopCrop = null;
  let mobileCrop = null;

  function refreshPreview() {
    const widthDef = PREVIEW_WIDTHS.find((w) => w.key === activePreviewWidth) || PREVIEW_WIDTHS[0];
    const frame = document.getElementById('be-preview-frame');
    const img = document.getElementById('be-preview-img');
    const caption = document.getElementById('be-preview-caption');
    // Scale the preview frame to fit the panel while still visually showing
    // the target width via its own max-width, same breakpoint logic the
    // real homepage uses (frontend/js/home-content.js).
    frame.style.width = `${Math.min(widthDef.px, 640)}px`;
    const useMobile = widthDef.px <= MOBILE_BREAKPOINT_PX && form.image_url_mobile;
    const src = useMobile ? form.image_url_mobile : form.image_url;
    const fx = useMobile && form.image_focus_x_mobile != null ? form.image_focus_x_mobile : form.image_focus_x;
    const fy = useMobile && form.image_focus_y_mobile != null ? form.image_focus_y_mobile : form.image_focus_y;
    const zoom = useMobile && form.image_zoom_mobile != null ? form.image_zoom_mobile : form.image_zoom;
    img.src = src || '';
    img.style.objectFit = 'cover';
    img.style.objectPosition = `${fx}% ${fy}%`;
    img.style.transform = `scale(${zoom})`;
    img.style.transformOrigin = `${fx}% ${fy}%`;
    caption.textContent = `${widthDef.label} · ${widthDef.px}px wide${useMobile ? ' · using mobile image' : ''}`;
  }

  if (form.image_url) {
    desktopCrop = mountCropTool(desktopCropEl, {
      imageUrl: form.image_url, focusX: form.image_focus_x, focusY: form.image_focus_y, zoom: form.image_zoom,
      onChange: (s) => { form.image_focus_x = s.focusX; form.image_focus_y = s.focusY; form.image_zoom = s.zoom; refreshPreview(); },
    });
  } else {
    desktopCropEl.innerHTML = '<p class="crop-tool__hint">Choose an image above to position and zoom it.</p>';
  }
  if (form.image_url_mobile) {
    mobileCrop = mountCropTool(mobileCropEl, {
      imageUrl: form.image_url_mobile,
      focusX: form.image_focus_x_mobile != null ? form.image_focus_x_mobile : form.image_focus_x,
      focusY: form.image_focus_y_mobile != null ? form.image_focus_y_mobile : form.image_focus_y,
      zoom: form.image_zoom_mobile != null ? form.image_zoom_mobile : form.image_zoom,
      onChange: (s) => { form.image_focus_x_mobile = s.focusX; form.image_focus_y_mobile = s.focusY; form.image_zoom_mobile = s.zoom; refreshPreview(); },
    });
  } else {
    mobileCropEl.innerHTML = '<p class="crop-tool__hint">Optional — upload a separately-cropped image for phones, or leave blank to reuse the desktop image and crop.</p>';
  }
  refreshPreview();

  document.getElementById('be-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    form.image_url = await fileToDataUrl(file);
    form.image_focus_x = 50; form.image_focus_y = 50; form.image_zoom = 1;
    if (desktopCrop) desktopCrop.setImage(form.image_url);
    else desktopCrop = mountCropTool(desktopCropEl, { imageUrl: form.image_url, focusX: 50, focusY: 50, zoom: 1, onChange: (s) => { form.image_focus_x = s.focusX; form.image_focus_y = s.focusY; form.image_zoom = s.zoom; refreshPreview(); } });
    refreshPreview();
  });
  document.getElementById('be-file-mobile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    form.image_url_mobile = await fileToDataUrl(file);
    form.image_focus_x_mobile = 50; form.image_focus_y_mobile = 50; form.image_zoom_mobile = 1;
    if (mobileCrop) mobileCrop.setImage(form.image_url_mobile);
    else mobileCrop = mountCropTool(mobileCropEl, { imageUrl: form.image_url_mobile, focusX: 50, focusY: 50, zoom: 1, onChange: (s) => { form.image_focus_x_mobile = s.focusX; form.image_focus_y_mobile = s.focusY; form.image_zoom_mobile = s.zoom; refreshPreview(); } });
    refreshPreview();
  });

  card.querySelectorAll('[data-preview-width]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activePreviewWidth = btn.getAttribute('data-preview-width');
      card.querySelectorAll('[data-preview-width]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPreview();
    });
  });

  document.getElementById('banner-editor-close').addEventListener('click', () => renderBannerEditor(null));
  document.getElementById('banner-cancel-btn').addEventListener('click', () => renderBannerEditor(null));

  document.getElementById('banner-save-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('banner-editor-error');
    errorEl.style.display = 'none';
    form.title = document.getElementById('be-title').value;
    form.subtitle = document.getElementById('be-subtitle').value;
    form.link_url = document.getElementById('be-link').value;
    form.placement = document.getElementById('be-placement').value;
    form.sort_order = parseInt(document.getElementById('be-sort').value, 10) || 1;
    form.is_active = document.getElementById('be-active').checked;
    form.scheduled_start = datetimeLocalToIso(document.getElementById('be-start').value);
    form.scheduled_end = datetimeLocalToIso(document.getElementById('be-end').value);
    if (!form.image_url) {
      errorEl.textContent = 'Choose a desktop image first.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      if (isEdit) {
        await api(`/api/banners/${banner.id}`, { method: 'PATCH', body: form });
      } else {
        await api('/api/banners', { method: 'POST', body: form });
      }
      renderBannerEditor(null);
      const { banners } = await api('/api/banners');
      bannerAllCache = banners;
      renderBannerTable();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// Homepage copy editor — lets a non-technical admin change every word on
// the homepage (hero text, story, feature strip, process steps) without
// touching code. Backed by /api/content (site_content table / mock map).
async function renderContentTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading homepage content…</p>';
  const { content } = await api('/api/content');
  const hero = content.homepage_hero || {};
  const story = content.homepage_story || {};
  const featureStrip = content.homepage_feature_strip || { items: [] };
  const process = content.homepage_process || { steps: [] };

  wrap.innerHTML = `
    <p style="font-size:0.85rem;color:var(--moss-700);margin-bottom:20px;">
      Everything here shows up on the homepage exactly as typed. Save each section separately.
    </p>

    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Hero (top of homepage)</h3>
      <div class="form-field"><label for="ct-hero-tagline">Small tagline above the headline</label><input id="ct-hero-tagline" value="${escapeAttr(hero.tagline)}" /></div>
      <div class="form-row">
        <div class="form-field"><label for="ct-hero-h1">Headline — line 1</label><input id="ct-hero-h1" value="${escapeAttr(hero.headline_line1)}" /></div>
        <div class="form-field"><label for="ct-hero-h2">Headline — line 2</label><input id="ct-hero-h2" value="${escapeAttr(hero.headline_line2)}" /></div>
      </div>
      <div class="form-field"><label for="ct-hero-body">Paragraph</label><textarea id="ct-hero-body" rows="2">${escapeAttr(hero.body)}</textarea></div>
      <div class="form-row">
        <div class="form-field"><label for="ct-hero-cta1-label">Primary button text</label><input id="ct-hero-cta1-label" value="${escapeAttr(hero.cta_primary_label)}" /></div>
        <div class="form-field"><label for="ct-hero-cta1-href">Primary button link</label><input id="ct-hero-cta1-href" value="${escapeAttr(hero.cta_primary_href)}" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label for="ct-hero-cta2-label">Secondary button text</label><input id="ct-hero-cta2-label" value="${escapeAttr(hero.cta_secondary_label)}" /></div>
        <div class="form-field"><label for="ct-hero-cta2-href">Secondary button link</label><input id="ct-hero-cta2-href" value="${escapeAttr(hero.cta_secondary_href)}" /></div>
      </div>
      <button class="btn btn--primary" id="ct-save-hero">Save Hero</button>
      <p class="form-error" id="ct-hero-error" style="display:none;"></p>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Feature strip (4 icons under the hero)</h3>
      <div id="ct-feature-items">
        ${(featureStrip.items || []).map((item, i) => `
          <div class="form-row" style="margin-bottom:8px;">
            <div class="form-field"><label>Title ${i + 1}</label><input class="ct-feature-title" value="${escapeAttr(item.title)}" /></div>
            <div class="form-field"><label>Text ${i + 1}</label><input class="ct-feature-body" value="${escapeAttr(item.body)}" /></div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--primary" id="ct-save-features">Save Feature Strip</button>
      <p class="form-error" id="ct-features-error" style="display:none;"></p>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Our Story section</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">This powers the <a href="/about" target="_blank" rel="noopener">/about ("Our Story")</a> page — not the homepage (its "Our Philosophy" section is fixed copy, edited directly in the code). Milestones start empty on purpose — the timeline is simply omitted from the page until you add real ones here. Only add facts you can stand behind (dates, certifications, counts) — nothing here is pre-filled with examples.</p>
      <div class="form-field"><label for="ct-story-eyebrow">Small label above the title</label><input id="ct-story-eyebrow" value="${escapeAttr(story.eyebrow)}" /></div>
      <div class="form-row">
        <div class="form-field"><label for="ct-story-t1">Title — line 1</label><input id="ct-story-t1" value="${escapeAttr(story.title_line1)}" /></div>
        <div class="form-field"><label for="ct-story-t2">Title — line 2</label><input id="ct-story-t2" value="${escapeAttr(story.title_line2)}" /></div>
      </div>
      <div class="form-field"><label for="ct-story-body">Paragraph</label><textarea id="ct-story-body" rows="3">${escapeAttr(story.body)}</textarea></div>
      <p style="font-size:0.8rem;color:var(--moss-700);margin-bottom:6px;">Milestones (year + text, optional — hidden from the page entirely while empty):</p>
      <div id="ct-story-milestones">
        ${(story.milestones || []).map((m, i) => `
          <div class="form-row ct-milestone-row" style="margin-bottom:8px;align-items:flex-end;">
            <div class="form-field"><label>Year ${i + 1}</label><input class="ct-milestone-year" value="${escapeAttr(m.year)}" style="max-width:100px;" /></div>
            <div class="form-field"><label>Text ${i + 1}</label><input class="ct-milestone-text" value="${escapeAttr(m.text)}" /></div>
            <button type="button" class="btn btn--outline btn--sm ct-milestone-remove" style="margin-bottom:4px;">Remove</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--outline btn--sm" id="ct-add-milestone" type="button" style="margin-bottom:12px;">+ Add milestone</button>
      <br />
      <button class="btn btn--primary" id="ct-save-story">Save Story</button>
      <p class="form-error" id="ct-story-error" style="display:none;"></p>
    </div>

    <div class="card">
      <h3 class="mt-0">Process section (From Farm to Bottle)</h3>
      <div class="form-field"><label for="ct-process-eyebrow">Small label</label><input id="ct-process-eyebrow" value="${escapeAttr(process.eyebrow)}" /></div>
      <div class="form-field"><label for="ct-process-title">Title</label><input id="ct-process-title" value="${escapeAttr(process.title)}" /></div>
      <div id="ct-process-steps">
        ${(process.steps || []).map((s, i) => `
          <div class="form-row" style="margin-bottom:8px;">
            <div class="form-field"><label>Step ${i + 1} title</label><input class="ct-step-title" value="${escapeAttr(s.title)}" /></div>
            <div class="form-field"><label>Step ${i + 1} text</label><input class="ct-step-body" value="${escapeAttr(s.body)}" /></div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--primary" id="ct-save-process">Save Process</button>
      <p class="form-error" id="ct-process-error" style="display:none;"></p>
    </div>
  `;

  async function save(key, value, errorElId, btnId) {
    const errorEl = document.getElementById(errorElId);
    errorEl.style.display = 'none';
    const btn = document.getElementById(btnId);
    const originalLabel = btn.textContent;
    try {
      await api(`/api/content/${key}`, { method: 'PATCH', body: value });
      btn.textContent = 'Saved ✓';
      setTimeout(() => (btn.textContent = originalLabel), 1500);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  }

  document.getElementById('ct-save-hero').addEventListener('click', () =>
    save(
      'homepage_hero',
      {
        tagline: document.getElementById('ct-hero-tagline').value,
        headline_line1: document.getElementById('ct-hero-h1').value,
        headline_line2: document.getElementById('ct-hero-h2').value,
        body: document.getElementById('ct-hero-body').value,
        cta_primary_label: document.getElementById('ct-hero-cta1-label').value,
        cta_primary_href: document.getElementById('ct-hero-cta1-href').value,
        cta_secondary_label: document.getElementById('ct-hero-cta2-label').value,
        cta_secondary_href: document.getElementById('ct-hero-cta2-href').value,
      },
      'ct-hero-error',
      'ct-save-hero'
    )
  );

  document.getElementById('ct-save-features').addEventListener('click', () => {
    const titles = Array.from(document.querySelectorAll('.ct-feature-title')).map((el) => el.value);
    const bodies = Array.from(document.querySelectorAll('.ct-feature-body')).map((el) => el.value);
    save('homepage_feature_strip', { items: titles.map((title, i) => ({ title, body: bodies[i] })) }, 'ct-features-error', 'ct-save-features');
  });

  function wireMilestoneRemoveButtons() {
    document.querySelectorAll('.ct-milestone-remove').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.ct-milestone-row')?.remove());
    });
  }
  wireMilestoneRemoveButtons();

  document.getElementById('ct-add-milestone').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'form-row ct-milestone-row';
    row.style.cssText = 'margin-bottom:8px;align-items:flex-end;';
    row.innerHTML = `
      <div class="form-field"><label>Year</label><input class="ct-milestone-year" style="max-width:100px;" /></div>
      <div class="form-field"><label>Text</label><input class="ct-milestone-text" /></div>
      <button type="button" class="btn btn--outline btn--sm ct-milestone-remove" style="margin-bottom:4px;">Remove</button>
    `;
    document.getElementById('ct-story-milestones').appendChild(row);
    wireMilestoneRemoveButtons();
  });

  document.getElementById('ct-save-story').addEventListener('click', () => {
    const years = Array.from(document.querySelectorAll('.ct-milestone-year')).map((el) => el.value.trim());
    const texts = Array.from(document.querySelectorAll('.ct-milestone-text')).map((el) => el.value.trim());
    const milestones = years.map((year, i) => ({ year, text: texts[i] })).filter((m) => m.year || m.text);
    save(
      'homepage_story',
      {
        eyebrow: document.getElementById('ct-story-eyebrow').value,
        title_line1: document.getElementById('ct-story-t1').value,
        title_line2: document.getElementById('ct-story-t2').value,
        body: document.getElementById('ct-story-body').value,
        milestones,
      },
      'ct-story-error',
      'ct-save-story'
    );
  });

  document.getElementById('ct-save-process').addEventListener('click', () => {
    const titles = Array.from(document.querySelectorAll('.ct-step-title')).map((el) => el.value);
    const bodies = Array.from(document.querySelectorAll('.ct-step-body')).map((el) => el.value);
    save(
      'homepage_process',
      {
        eyebrow: document.getElementById('ct-process-eyebrow').value,
        title: document.getElementById('ct-process-title').value,
        steps: titles.map((title, i) => ({ title, body: bodies[i] })),
      },
      'ct-process-error',
      'ct-save-process'
    );
  });
}

function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/"/g, '&quot;');
}

// Dashboard home — the landing tab (Admin Phase 1 per the CMS audit). Real
// KPIs only (no placeholder numbers), plus an alerts strip that jumps
// straight to the tab that needs attention. Shares its data source with
// Reports (same three API calls) rather than duplicating a separate
// aggregation path.
async function renderDashboardHomeTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading dashboard…</p>';
  const [{ orders }, { products }, settings] = await Promise.all([
    api('/api/orders'),
    api('/api/products'),
    api('/api/content', { auth: false }).then((r) => r.content.store_settings || {}),
  ]);

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const todayOrders = orders.filter((o) => (o.created_at || '').slice(0, 10) === todayStr);
  const todayPaid = todayOrders.filter((o) => o.payment_status === 'paid');
  const todaySales = todayPaid.reduce((sum, o) => sum + o.total_paise, 0);
  const monthRevenue = paidOrders.filter((o) => (o.created_at || '').slice(0, 7) === monthStr).reduce((sum, o) => sum + o.total_paise, 0);
  const pendingOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const unpaidOrders = orders.filter((o) => o.payment_status === 'pending' && o.payment_gateway !== 'cod');

  const lowStockThreshold = settings.low_stock_threshold != null ? settings.low_stock_threshold : 10;
  const outOfStock = products.filter((p) => !p.is_coming_soon && p.stock <= 0);
  const lowStock = products.filter((p) => !p.is_coming_soon && p.stock > 0 && p.stock <= lowStockThreshold);

  const alerts = [
    pendingOrders.length ? { label: `${pendingOrders.length} order${pendingOrders.length === 1 ? '' : 's'} awaiting action`, tab: 'orders' } : null,
    outOfStock.length ? { label: `${outOfStock.length} product${outOfStock.length === 1 ? '' : 's'} out of stock`, tab: 'products' } : null,
    lowStock.length ? { label: `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} low on stock`, tab: 'products' } : null,
    unpaidOrders.length ? { label: `${unpaidOrders.length} order${unpaidOrders.length === 1 ? '' : 's'} unpaid (non-COD)`, tab: 'orders' } : null,
  ].filter(Boolean);

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
      <div class="card"><div class="eyebrow">Today's Sales</div><h2 style="margin:0;" class="mono">${formatRupees(todaySales)}</h2></div>
      <div class="card"><div class="eyebrow">Today's Orders</div><h2 style="margin:0;">${todayOrders.length}</h2></div>
      <div class="card"><div class="eyebrow">Monthly Revenue</div><h2 style="margin:0;" class="mono">${formatRupees(monthRevenue)}</h2></div>
      <div class="card"><div class="eyebrow">Total Customers</div><h2 style="margin:0;" id="dash-customer-count">—</h2></div>
    </div>
    ${
      alerts.length
        ? `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--clay-500);">
            <h3 class="mt-0">Needs attention</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${alerts.map((a) => `<button type="button" class="btn btn--outline btn--sm" style="text-align:left;width:fit-content;" data-alert-tab="${a.tab}">${a.label} →</button>`).join('')}
            </div>
          </div>`
        : `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--moss-600);"><strong>All clear</strong> — no orders or stock issues need attention right now.</div>`
    }
    <div class="flex-between">
      <p style="color:var(--moss-700);font-size:0.88rem;">For full sales/order/coupon breakdowns, see <button type="button" data-alert-tab="reports" style="background:none;border:none;text-decoration:underline;cursor:pointer;color:inherit;padding:0;font:inherit;">Reports</button>.</p>
    </div>
  `;

  wrap.querySelectorAll('[data-alert-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-alert-tab');
      const navBtn = document.querySelector(`.dashboard-nav button[data-tab="${tab}"]`);
      if (navBtn) navBtn.click();
    });
  });

  // Customer count is a separate, admin/staff-only endpoint (not part of the
  // two calls above) — fetched after the rest of the dashboard has already
  // rendered so a slow/failed customers lookup never blocks the KPIs that
  // matter more (sales/orders).
  api('/api/customers')
    .then(({ customers }) => {
      const el = document.getElementById('dash-customer-count');
      if (el) el.textContent = String((customers || []).length);
    })
    .catch(() => {
      const el = document.getElementById('dash-customer-count');
      if (el) el.textContent = '—';
    });
}

// Admin Phase 6: server-side, date-ranged reports. Previously this whole
// tab pulled every order/product/coupon over the wire on every load and
// computed everything client-side with no way to look at anything but "all
// time" — now it's one call to GET /api/reports/summary (see
// dataStore.js's getReportsSummary), which also adds customer/referral
// numbers the old client-computed version never had at all.
const REPORT_RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

function reportRangeFromPreset(preset) {
  const toStr = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const todayStr = toStr(today);
  if (preset === 'today') return { from: todayStr, to: todayStr };
  if (preset === '7d') {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return { from: toStr(d), to: todayStr };
  }
  if (preset === '30d') {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return { from: toStr(d), to: todayStr };
  }
  if (preset === 'month') return { from: `${todayStr.slice(0, 7)}-01`, to: todayStr };
  return { from: '', to: '' }; // all time
}

async function renderReportsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading report…</p>';

  let currentFrom = '';
  let currentTo = '';

  async function loadAndRender(from, to) {
    wrap.querySelector('#report-body') && (wrap.querySelector('#report-body').style.opacity = '0.5');
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const { report } = await api(`/api/reports/summary${qs.toString() ? `?${qs}` : ''}`);
    renderBody(report);
  }

  function renderBody(r) {
    const bodyHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
        <div class="card"><div class="eyebrow">Revenue (paid orders)</div><h2 style="margin:0;" class="mono">${formatRupees(r.revenuePaise)}</h2></div>
        <div class="card"><div class="eyebrow">Orders</div><h2 style="margin:0;">${r.orderCount} <span style="font-size:0.9rem;color:var(--moss-700);">(${r.paidOrderCount} paid)</span></h2></div>
        <div class="card"><div class="eyebrow">Average order value</div><h2 style="margin:0;" class="mono">${formatRupees(r.aovPaise)}</h2></div>
        <div class="card"><div class="eyebrow">Refunded</div><h2 style="margin:0;" class="mono">${formatRupees(r.refundedPaise)}</h2></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
        <div class="card">
          <h3 class="mt-0">Orders by status</h3>
          ${
            Object.entries(r.ordersByStatus)
              .map(([status, count]) => `<div class="flex-between"><span class="status-pill status-${status}">${status}</span><span class="mono">${count}</span></div>`)
              .join('') || '<p style="color:var(--moss-700);">No orders in this range.</p>'
          }
        </div>
        <div class="card">
          <h3 class="mt-0">Best sellers (by units, paid orders)</h3>
          ${r.bestSellers.length ? r.bestSellers.map((b) => `<div class="flex-between"><span>${b.name}</span><span class="mono">${b.quantity}</span></div>`).join('') : '<p style="color:var(--moss-700);">No paid orders in this range.</p>'}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
        <div class="card">
          <h3 class="mt-0">Coupon usage <span style="font-weight:400;font-size:0.78rem;color:var(--moss-700);">(in range)</span></h3>
          ${
            r.couponUsage.length
              ? r.couponUsage.map((c) => `<div class="flex-between"><span class="mono">${c.code}</span><span>${c.orders} order(s), −${formatRupees(c.discountPaise)}</span></div>`).join('')
              : '<p style="color:var(--moss-700);">No coupons used in this range.</p>'
          }
        </div>
        <div class="card">
          <h3 class="mt-0">Low stock <span style="font-weight:400;font-size:0.78rem;color:var(--moss-700);">(current, not date-ranged)</span></h3>
          ${r.lowStock.length ? r.lowStock.map((p) => `<div class="flex-between"><span>${p.name}</span><span class="mono">${p.stock} / ${p.threshold}</span></div>`).join('') : '<p style="color:var(--moss-700);">Nothing low on stock.</p>'}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="card">
          <h3 class="mt-0">Customers <span style="font-weight:400;font-size:0.78rem;color:var(--moss-700);">(in range)</span></h3>
          <div class="flex-between"><span>New signups</span><span class="mono">${r.newCustomerCount}</span></div>
          <h4 style="margin:12px 0 6px;font-size:0.85rem;">Top spenders</h4>
          ${
            r.topCustomers.length
              ? r.topCustomers.map((c) => `<div class="flex-between"><span>${c.full_name || c.email}</span><span class="mono">${formatRupees(c.spendPaise)}</span></div>`).join('')
              : '<p style="color:var(--moss-700);">No paid orders in this range.</p>'
          }
        </div>
        <div class="card">
          <h3 class="mt-0">Referrals &amp; Groove Points <span style="font-weight:400;font-size:0.78rem;color:var(--moss-700);">(in range)</span></h3>
          <div class="flex-between"><span>Referred signups</span><span class="mono">${r.referralSignupCount}</span></div>
          <div class="flex-between"><span>Referral discount given</span><span class="mono">${formatRupees(r.referralDiscountPaidPaise)}</span></div>
          <div class="flex-between"><span>Referral bonus points paid</span><span class="mono">${r.referralBonusPointsPaidOut}</span></div>
          <div class="flex-between"><span>Points earned</span><span class="mono">${r.pointsEarned}</span></div>
          <div class="flex-between"><span>Points redeemed</span><span class="mono">${r.pointsRedeemed}</span></div>
        </div>
      </div>
    `;
    wrap.querySelector('#report-body').innerHTML = bodyHtml;
    wrap.querySelector('#report-body').style.opacity = '1';
  }

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:20px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
      <div class="form-field" style="margin:0;">
        <label>Quick range</label>
        <select id="report-preset">
          ${REPORT_RANGE_PRESETS.map((p) => `<option value="${p.key}" ${p.key === '30d' ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-field" style="margin:0;"><label>From</label><input type="date" id="report-from" /></div>
      <div class="form-field" style="margin:0;"><label>To</label><input type="date" id="report-to" /></div>
      <button class="btn btn--outline btn--sm" id="report-apply">Apply</button>
    </div>
    <div id="report-body"><p>Loading…</p></div>
  `;

  const presetSelect = document.getElementById('report-preset');
  const fromInput = document.getElementById('report-from');
  const toInput = document.getElementById('report-to');

  function applyPreset() {
    const { from, to } = reportRangeFromPreset(presetSelect.value);
    fromInput.value = from;
    toInput.value = to;
    currentFrom = from;
    currentTo = to;
    loadAndRender(from, to);
  }

  presetSelect.addEventListener('change', applyPreset);
  document.getElementById('report-apply').addEventListener('click', () => {
    currentFrom = fromInput.value;
    currentTo = toInput.value;
    loadAndRender(currentFrom, currentTo);
  });

  applyPreset();
}

// Admin Phase 6: Audit Log tab — a browsable, filterable view over the
// audit_log table (backend/lib/dataStore.js's logAudit/listAuditLog). Only
// covers actions not already fully tracked elsewhere (product/variant/
// category/coupon/shipping-rate CRUD, refund request/process/reject,
// mark-COD-paid, customer status changes/points adjustments/impersonation)
// — order status/tracking changes live in the Order Detail panel's timeline
// instead (order_status_events), and plain stock edits live in each
// product's stock-adjustment history, so neither is duplicated here.
async function renderAuditLogTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading audit log…</p>';

  async function loadAndRender(from, to) {
    const body = wrap.querySelector('#audit-body');
    if (body) body.style.opacity = '0.5';
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const { entries } = await api(`/api/reports/audit-log${qs.toString() ? `?${qs}` : ''}`);
    renderBody(entries);
  }

  function renderBody(entries) {
    const rowsHtml = entries.length
      ? entries
          .map(
            (e) => `
              <tr>
                <td style="white-space:nowrap;color:var(--moss-700);font-size:0.85rem;">${formatOrderEventTime(e.created_at)}</td>
                <td>${escapeAttr(e.actor || '—')}${e.actor_role ? ` <span style="color:var(--moss-700);font-size:0.78rem;">(${escapeAttr(e.actor_role)})</span>` : ''}</td>
                <td class="mono" style="font-size:0.85rem;">${escapeAttr(e.action || '—')}</td>
                <td>${escapeAttr(e.summary || '')}</td>
              </tr>`
          )
          .join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--moss-700);">No audit entries in this range.</td></tr>';

    wrap.querySelector('#audit-body').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    wrap.querySelector('#audit-body').style.opacity = '1';
  }

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <p style="font-size:0.85rem;color:var(--moss-700);margin:0 0 12px;">
        A cross-domain log of admin actions — catalog/coupon/shipping edits, refunds, and customer account changes.
        Order status and tracking updates have their own full timeline on each order's Details panel (Orders tab),
        and stock changes have their own history on each product, so those aren't repeated here.
      </p>
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div class="form-field" style="margin:0;">
          <label>Quick range</label>
          <select id="audit-preset">
            ${REPORT_RANGE_PRESETS.map((p) => `<option value="${p.key}" ${p.key === 'all' ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-field" style="margin:0;"><label>From</label><input type="date" id="audit-from" /></div>
        <div class="form-field" style="margin:0;"><label>To</label><input type="date" id="audit-to" /></div>
        <button class="btn btn--outline btn--sm" id="audit-apply">Apply</button>
      </div>
    </div>
    <div id="audit-body"><p>Loading…</p></div>
  `;

  const presetSelect = document.getElementById('audit-preset');
  const fromInput = document.getElementById('audit-from');
  const toInput = document.getElementById('audit-to');

  function applyPreset() {
    const { from, to } = reportRangeFromPreset(presetSelect.value);
    fromInput.value = from;
    toInput.value = to;
    loadAndRender(from, to);
  }

  presetSelect.addEventListener('change', applyPreset);
  document.getElementById('audit-apply').addEventListener('click', () => {
    loadAndRender(fromInput.value, toInput.value);
  });

  applyPreset();
}

const LEGAL_PAGE_TABS = [
  { key: 'page_terms', label: 'Terms & Conditions' },
  { key: 'page_privacy', label: 'Privacy Policy' },
  { key: 'page_refund_policy', label: 'Refund & Return Policy' },
  { key: 'page_shipping_policy', label: 'Shipping Policy' },
];

async function renderLegalTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading legal pages…</p>';
  const { content } = await api('/api/content', { auth: false });

  const faqPage = content.page_faq || { title: 'Frequently Asked Questions', items: [] };
  const faqItems = Array.isArray(faqPage.items) ? faqPage.items : [];

  wrap.innerHTML =
    LEGAL_PAGE_TABS.map((page) => {
      const value = content[page.key] || { title: page.label, body: '' };
      return `
      <div class="card" style="margin-bottom:20px;">
        <h3 class="mt-0">${page.label}</h3>
        <div class="form-field"><label>Page title</label><input class="lp-title" data-key="${page.key}" value="${escapeAttr(value.title)}" /></div>
        <div class="form-field"><label>Body</label><textarea class="lp-body" data-key="${page.key}" rows="8">${value.body || ''}</textarea></div>
        <button class="btn btn--primary btn--sm" data-lp-save="${page.key}">Save</button>
        <span class="form-error" data-lp-saved="${page.key}" style="display:none;color:var(--moss-700);">Saved.</span>
      </div>`;
    }).join('') +
    `
      <div class="card" style="margin-bottom:20px;">
        <h3 class="mt-0">FAQ page (/faq)</h3>
        <div class="form-field"><label>Page title</label><input id="faq-title" value="${escapeAttr(faqPage.title)}" /></div>
        <div class="form-field">
          <label>Questions — one "Question | Answer" pair per line</label>
          <textarea id="faq-items" rows="8">${faqItems.map((f) => `${f.question} | ${f.answer}`).join('\n')}</textarea>
        </div>
        <button class="btn btn--primary btn--sm" id="faq-save">Save</button>
        <span class="form-error" id="faq-saved" style="display:none;color:var(--moss-700);">Saved.</span>
      </div>`;

  wrap.querySelectorAll('[data-lp-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-lp-save');
      const title = wrap.querySelector(`.lp-title[data-key="${key}"]`).value;
      const body = wrap.querySelector(`.lp-body[data-key="${key}"]`).value;
      await api(`/api/content/${key}`, { method: 'PATCH', body: { title, body } });
      const saved = wrap.querySelector(`[data-lp-saved="${key}"]`);
      saved.style.display = 'inline';
      setTimeout(() => (saved.style.display = 'none'), 2000);
    });
  });

  document.getElementById('faq-save').addEventListener('click', async () => {
    const title = document.getElementById('faq-title').value.trim() || 'Frequently Asked Questions';
    const items = document
      .getElementById('faq-items')
      .value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [q, ...rest] = line.split('|');
        return { question: (q || '').trim(), answer: rest.join('|').trim() };
      })
      .filter((f) => f.question && f.answer);
    await api('/api/content/page_faq', { method: 'PATCH', body: { title, items } });
    const saved = document.getElementById('faq-saved');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });
}

// States/UTs of India — used for the seller-state picker (Store Settings)
// and the shipping-zone state selector (Shipping Rates), both of which
// feed backend/lib/dataStore.js's CGST/SGST-vs-IGST and shipping-zone
// matching. Plain data, not fetched from anywhere — this list doesn't
// change.
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

async function renderStoreSettingsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading settings…</p>';
  const { content } = await api('/api/content', { auth: false });
  const s = content.store_settings || {};

  wrap.innerHTML = `
    <div class="card">
      <h3 class="mt-0">Business details</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Used on invoices and the contact page. No API keys or secrets go here — those stay in backend/.env.</p>
      <div class="form-row">
        <div class="form-field"><label>Legal business name</label><input id="ss-legal-name" value="${escapeAttr(s.business_legal_name)}" /></div>
        <div class="form-field"><label>GSTIN</label><input id="ss-gstin" value="${escapeAttr(s.gstin)}" /></div>
      </div>
      <div class="form-field"><label>Business address</label><textarea id="ss-address" rows="2">${escapeAttr(s.business_address)}</textarea></div>
      <div class="form-field">
        <label>Seller / business state <span style="font-weight:400;color:var(--moss-700);">(the state you're GST-registered in)</span></label>
        <select id="ss-seller-state">
          <option value="">— Not set (every order treated as intrastate) —</option>
          ${INDIAN_STATES.map((st) => `<option value="${st}" ${s.seller_state === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
        <p style="font-size:0.78rem;color:var(--moss-700);margin:4px 0 0;">Compared against each order's shipping state to charge CGST+SGST (same state) or IGST (different state) — see the Orders tab's Tax column.</p>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Support email</label><input id="ss-support-email" value="${escapeAttr(s.support_email)}" /></div>
        <div class="form-field"><label>Support phone</label><input id="ss-support-phone" value="${escapeAttr(s.support_phone)}" /></div>
      </div>
    </div>
    <div class="card">
      <h3 class="mt-0">Checkout & shipping</h3>
      <div class="form-row">
        <div class="form-field"><label><input type="checkbox" id="ss-charge-gst" ${s.charge_gst !== false ? 'checked' : ''} /> Charge GST</label></div>
        <div class="form-field"><label><input type="checkbox" id="ss-cod-enabled" ${s.cod_enabled ? 'checked' : ''} /> Cash on Delivery (COD) enabled</label></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>COD extra charge (₹)</label><input id="ss-cod-charge" type="number" min="0" step="0.01" value="${s.cod_extra_charge_paise ? (s.cod_extra_charge_paise / 100).toFixed(2) : '0'}" /></div>
      </div>
      <div class="form-field"><label>Free shipping threshold (₹) <span style="font-weight:400;color:var(--moss-700);">(0 disables free shipping)</span></label><input id="ss-free-shipping" type="number" min="0" step="1" value="${s.free_shipping_threshold_paise ? (s.free_shipping_threshold_paise / 100).toFixed(0) : '0'}" /></div>
      <div class="form-field"><label>Blocked pincodes (comma-separated, optional)</label><input id="ss-blocked-pincodes" value="${(s.blocked_pincodes || []).join(', ')}" /></div>
      <div class="form-field"><label>Low-stock alert threshold (units)</label><input id="ss-low-stock" type="number" min="0" value="${s.low_stock_threshold != null ? s.low_stock_threshold : 10}" /></div>
    </div>
    <div class="card">
      <h3 class="mt-0">Groove Points loyalty</h3>
      <div class="form-field"><label><input type="checkbox" id="ss-loyalty-enabled" ${s.loyalty_points_enabled ? 'checked' : ''} /> Enabled</label></div>
      <div class="form-row">
        <div class="form-field"><label>₹ spent per point earned</label><input id="ss-loyalty-earn" type="number" min="1" value="${s.loyalty_earn_rate_paise_per_point ? (s.loyalty_earn_rate_paise_per_point / 100).toFixed(0) : '100'}" /></div>
        <div class="form-field"><label>₹ value per point redeemed</label><input id="ss-loyalty-redeem" type="number" min="0.01" step="0.01" value="${s.loyalty_redeem_value_paise_per_point ? (s.loyalty_redeem_value_paise_per_point / 100).toFixed(2) : '1'}" /></div>
      </div>
      <div class="form-field"><label>Max % of an order points can cover</label><input id="ss-loyalty-cap" type="number" min="0" max="100" value="${s.loyalty_redeem_cap_percent != null ? s.loyalty_redeem_cap_percent : 50}" /></div>
    </div>
    <div class="card">
      <h3 class="mt-0">Refer a friend</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Every customer gets a share link from their account (Refer & Earn tab). When someone signs up through it: the referrer earns Groove Points on every order their friend places, and the new customer gets a discount automatically on their own first order — no coupon code needed either way.</p>
      <div class="form-field"><label><input type="checkbox" id="ss-referral-enabled" ${s.referral_program_enabled ? 'checked' : ''} /> Enabled</label></div>
      <div class="form-row">
        <div class="form-field"><label>Groove Points per order (to the referrer)</label><input id="ss-referral-points" type="number" min="0" value="${s.referral_points_per_order != null ? s.referral_points_per_order : 100}" /></div>
        <div class="form-field"><label>Discount % on the friend's first order</label><input id="ss-referral-discount" type="number" min="0" max="100" value="${s.referral_discount_percent != null ? s.referral_discount_percent : 10}" /></div>
      </div>
    </div>
    <button class="btn btn--primary" id="ss-save">Save Settings</button>
    <span class="form-error" id="ss-saved" style="display:none;color:var(--moss-700);">Saved.</span>
  `;

  document.getElementById('ss-save').addEventListener('click', async () => {
    const blocked = document
      .getElementById('ss-blocked-pincodes')
      .value.split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    await api('/api/content/store_settings', {
      method: 'PATCH',
      body: {
        business_legal_name: document.getElementById('ss-legal-name').value,
        gstin: document.getElementById('ss-gstin').value,
        business_address: document.getElementById('ss-address').value,
        seller_state: document.getElementById('ss-seller-state').value,
        support_email: document.getElementById('ss-support-email').value,
        support_phone: document.getElementById('ss-support-phone').value,
        charge_gst: document.getElementById('ss-charge-gst').checked,
        cod_enabled: document.getElementById('ss-cod-enabled').checked,
        cod_extra_charge_paise: Math.round((parseFloat(document.getElementById('ss-cod-charge').value) || 0) * 100),
        free_shipping_threshold_paise: Math.round((parseFloat(document.getElementById('ss-free-shipping').value) || 0) * 100),
        blocked_pincodes: blocked,
        low_stock_threshold: parseInt(document.getElementById('ss-low-stock').value, 10) || 0,
        loyalty_points_enabled: document.getElementById('ss-loyalty-enabled').checked,
        loyalty_earn_rate_paise_per_point: Math.round((parseFloat(document.getElementById('ss-loyalty-earn').value) || 100) * 100),
        loyalty_redeem_value_paise_per_point: Math.round((parseFloat(document.getElementById('ss-loyalty-redeem').value) || 1) * 100),
        loyalty_redeem_cap_percent: parseInt(document.getElementById('ss-loyalty-cap').value, 10) || 0,
        referral_program_enabled: document.getElementById('ss-referral-enabled').checked,
        referral_points_per_order: parseInt(document.getElementById('ss-referral-points').value, 10) || 0,
        referral_discount_percent: parseInt(document.getElementById('ss-referral-discount').value, 10) || 0,
      },
    });
    const saved = document.getElementById('ss-saved');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });
}

async function renderCouponsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading coupons…</p>';
  const [{ coupons }, { products }, { categories }] = await Promise.all([
    api('/api/coupons'),
    api('/api/products'),
    api('/api/categories'),
  ]);

  function restrictionSummary(c) {
    const parts = [];
    if (c.starts_at) parts.push(`from ${new Date(c.starts_at).toLocaleDateString('en-IN')}`);
    if (c.expires_at) parts.push(`until ${new Date(c.expires_at).toLocaleDateString('en-IN')}`);
    if (c.per_customer_limit) parts.push(`max ${c.per_customer_limit}/customer`);
    if (Array.isArray(c.product_ids) && c.product_ids.length) parts.push(`${c.product_ids.length} product(s) only`);
    if (Array.isArray(c.category_ids) && c.category_ids.length) parts.push(`${c.category_ids.length} categor${c.category_ids.length === 1 ? 'y' : 'ies'} only`);
    const now = new Date();
    if (c.starts_at && new Date(c.starts_at) > now) parts.push('(not started yet)');
    if (c.expires_at && new Date(c.expires_at) < now) parts.push('(expired)');
    return parts.length ? parts.join(' · ') : 'No restrictions';
  }

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a coupon</h3>
      <div class="form-row">
        <div class="form-field"><label>Code</label><input id="cp-code" placeholder="e.g. GROOVE20" /></div>
        <div class="form-field">
          <label>Type</label>
          <select id="cp-type"><option value="percent">Percent off</option><option value="flat">Flat amount off</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Value <span style="font-weight:400;color:var(--moss-700);">(percent, or ₹ for flat)</span></label><input id="cp-value" type="number" min="0" step="0.01" /></div>
        <div class="form-field"><label>Max discount (₹, optional — percent only)</label><input id="cp-max" type="number" min="0" step="0.01" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Minimum order (₹, optional)</label><input id="cp-min" type="number" min="0" step="0.01" /></div>
        <div class="form-field"><label>Usage limit (optional, total)</label><input id="cp-limit" type="number" min="1" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Starts (optional)</label><input id="cp-starts" type="date" /></div>
        <div class="form-field"><label>Expires (optional)</label><input id="cp-expires" type="date" /></div>
      </div>
      <div class="form-field"><label>Per-customer limit (optional — signed-in customers only)</label><input id="cp-percustomer" type="number" min="1" style="max-width:200px;" /></div>
      <p style="font-size:0.8rem;color:var(--moss-700);">Restricting a coupon to specific products/categories can be set after creating it, from its "Details" panel below.</p>
      <button class="btn btn--primary" id="cp-add">Add Coupon</button>
      <p class="form-error" id="cp-error" style="display:none;"></p>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Restrictions</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${coupons
            .map(
              (c) => `
            <tr data-id="${c.id}">
              <td class="mono">${c.code}</td>
              <td>${c.discount_type === 'percent' ? `${c.discount_value}%${c.max_discount_paise ? ` (max ${formatRupees(c.max_discount_paise)})` : ''}` : formatRupees(c.discount_value)}</td>
              <td class="mono">${c.min_order_paise ? formatRupees(c.min_order_paise) : '—'}</td>
              <td class="mono">${c.times_used}${c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
              <td style="font-size:0.78rem;color:var(--moss-700);">${restrictionSummary(c)}</td>
              <td><input type="checkbox" data-cp-active="${c.id}" ${c.is_active ? 'checked' : ''} /></td>
              <td style="white-space:nowrap;">
                <button class="btn btn--outline btn--sm" data-toggle-coupon-detail="${c.id}">Details</button>
                <button class="btn btn--outline btn--sm" data-cp-delete="${c.id}">Delete</button>
              </td>
            </tr>
            <tr class="variants-row" data-coupon-detail-for="${c.id}" style="display:none;">
              <td colspan="7"><div class="variants-panel" data-coupon-detail-panel="${c.id}"></div></td>
            </tr>`
            )
            .join('') || '<tr><td colspan="7" style="color:var(--moss-700);">No coupons yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('cp-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('cp-error');
    errorEl.style.display = 'none';
    const code = document.getElementById('cp-code').value.trim();
    const value = parseFloat(document.getElementById('cp-value').value);
    if (!code || !value) {
      errorEl.textContent = 'Code and value are required.';
      errorEl.style.display = 'block';
      return;
    }
    const type = document.getElementById('cp-type').value;
    const maxRaw = document.getElementById('cp-max').value.trim();
    const minRaw = document.getElementById('cp-min').value.trim();
    const limitRaw = document.getElementById('cp-limit').value.trim();
    const startsRaw = document.getElementById('cp-starts').value;
    const expiresRaw = document.getElementById('cp-expires').value;
    const perCustomerRaw = document.getElementById('cp-percustomer').value.trim();
    try {
      await api('/api/coupons', {
        method: 'POST',
        body: {
          code,
          discount_type: type,
          discount_value: type === 'flat' ? Math.round(value * 100) : value,
          max_discount_paise: maxRaw ? Math.round(parseFloat(maxRaw) * 100) : null,
          min_order_paise: minRaw ? Math.round(parseFloat(minRaw) * 100) : 0,
          usage_limit: limitRaw ? parseInt(limitRaw, 10) : null,
          starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
          expires_at: expiresRaw ? new Date(`${expiresRaw}T23:59:59`).toISOString() : null,
          per_customer_limit: perCustomerRaw ? parseInt(perCustomerRaw, 10) : null,
          is_active: true,
        },
      });
      renderCouponsTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
  wrap.querySelectorAll('[data-cp-active]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/coupons/${input.getAttribute('data-cp-active')}`, { method: 'PATCH', body: { is_active: input.checked } });
    });
  });
  wrap.querySelectorAll('[data-cp-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this coupon?')) return;
      await api(`/api/coupons/${btn.getAttribute('data-cp-delete')}`, { method: 'DELETE' });
      renderCouponsTab();
    });
  });
  wrap.querySelectorAll('[data-toggle-coupon-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-toggle-coupon-detail');
      const row = wrap.querySelector(`[data-coupon-detail-for="${id}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      btn.textContent = isHidden ? 'Hide' : 'Details';
      if (isHidden) {
        const c = coupons.find((x) => x.id === id);
        renderCouponDetailPanel(id, c, products, categories);
      }
    });
  });
}

// Admin Phase 5: per-coupon restriction editor — start/expiry dates,
// per-customer limit, and restricting the coupon to specific
// products/categories. Split out from the main "Add a coupon" form (which
// stays focused on the common case) into this per-row Details panel, same
// pattern as every other expandable panel in this build.
async function renderCouponDetailPanel(couponId, coupon, products, categories) {
  const panel = document.querySelector(`[data-coupon-detail-panel="${couponId}"]`);
  const toDateInputValue = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
  const selectedProductIds = new Set(coupon.product_ids || []);
  const selectedCategoryIds = new Set(coupon.category_ids || []);

  panel.innerHTML = `
    <div style="max-width:640px;">
      <div class="form-row">
        <div class="form-field"><label for="cpd-starts-${couponId}">Starts</label><input id="cpd-starts-${couponId}" type="date" value="${toDateInputValue(coupon.starts_at)}" /></div>
        <div class="form-field"><label for="cpd-expires-${couponId}">Expires</label><input id="cpd-expires-${couponId}" type="date" value="${toDateInputValue(coupon.expires_at)}" /></div>
      </div>
      <div class="form-field"><label for="cpd-percustomer-${couponId}">Per-customer limit (signed-in customers only)</label><input id="cpd-percustomer-${couponId}" type="number" min="1" value="${coupon.per_customer_limit || ''}" style="max-width:200px;" /></div>
      <div class="form-row">
        <div class="form-field">
          <label>Restrict to categories <span style="font-weight:400;color:var(--moss-700);">(none selected = all categories)</span></label>
          <select id="cpd-categories-${couponId}" multiple size="6" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--sand-300);">
            ${categories.map((cat) => `<option value="${cat.id}" ${selectedCategoryIds.has(cat.id) ? 'selected' : ''}>${cat.parent_id ? '— ' : ''}${cat.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Restrict to products <span style="font-weight:400;color:var(--moss-700);">(none selected = all products)</span></label>
          <select id="cpd-products-${couponId}" multiple size="6" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--sand-300);">
            ${products.map((p) => `<option value="${p.id}" ${selectedProductIds.has(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <p style="font-size:0.78rem;color:var(--moss-700);">Ctrl/Cmd-click (or Shift-click for a range) to select multiple. If both a category and a product restriction are set, a cart item matching EITHER qualifies.</p>
      <button class="btn btn--primary btn--sm" data-coupon-save="${couponId}">Save</button>
      <span data-coupon-save-status style="font-size:0.8rem;color:var(--moss-700);margin-left:8px;"></span>
    </div>
  `;

  panel.querySelector('[data-coupon-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const statusEl = panel.querySelector('[data-coupon-save-status]');
    btn.disabled = true;
    statusEl.textContent = 'Saving…';
    try {
      const startsRaw = panel.querySelector(`#cpd-starts-${couponId}`).value;
      const expiresRaw = panel.querySelector(`#cpd-expires-${couponId}`).value;
      const perCustomerRaw = panel.querySelector(`#cpd-percustomer-${couponId}`).value.trim();
      const selectedCategories = Array.from(panel.querySelector(`#cpd-categories-${couponId}`).selectedOptions).map((o) => o.value);
      const selectedProducts = Array.from(panel.querySelector(`#cpd-products-${couponId}`).selectedOptions).map((o) => o.value);
      await api(`/api/coupons/${couponId}`, {
        method: 'PATCH',
        body: {
          starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
          expires_at: expiresRaw ? new Date(`${expiresRaw}T23:59:59`).toISOString() : null,
          per_customer_limit: perCustomerRaw ? parseInt(perCustomerRaw, 10) : null,
          category_ids: selectedCategories.length ? selectedCategories : null,
          product_ids: selectedProducts.length ? selectedProducts : null,
        },
      });
      statusEl.textContent = 'Saved.';
      setTimeout(() => renderCouponsTab(), 600);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
      statusEl.style.color = '#b91c1c';
      btn.disabled = false;
    }
  });
}

// Reads a slab's zone fields back out of its row (or the "add" form when
// idPrefix is 'new') into the shape the backend expects — states/
// pincode_prefixes as arrays (or null when left blank, meaning "any"),
// min/max order in paise, min/max weight in grams. Shared by both the
// per-row Save handler and the Add-rate handler below so the two stay in
// sync.
function readSlabZoneFields(scope, id) {
  const val = (sel) => scope.querySelector(sel)?.value.trim() || '';
  const states = val(`[data-slab-states="${id}"]`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pincodes = val(`[data-slab-pincodes="${id}"]`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const minOrder = val(`[data-slab-min-order="${id}"]`);
  const maxOrder = val(`[data-slab-max-order="${id}"]`);
  const minWeight = val(`[data-slab-min-weight="${id}"]`);
  const zoneName = val(`[data-slab-zone="${id}"]`);
  return {
    zone_name: zoneName || null,
    states: states.length ? states : null,
    pincode_prefixes: pincodes.length ? pincodes : null,
    min_order_paise: minOrder === '' ? null : Math.round(parseFloat(minOrder) * 100),
    max_order_paise: maxOrder === '' ? null : Math.round(parseFloat(maxOrder) * 100),
    min_weight_grams: minWeight === '' ? null : parseInt(minWeight, 10),
  };
}

async function renderShippingRatesTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading shipping rates…</p>';
  const [{ slabs }, { shippingClasses }] = await Promise.all([
    api('/api/shipping/rate-slabs', { auth: false }),
    api('/api/shipping/classes', { auth: false }),
  ]);

  const slabRow = (s) => `
    <tr data-id="${s.id}">
      <td><input value="${escapeAttr(s.zone_name)}" data-slab-zone="${s.id}" placeholder="e.g. Metro" style="width:110px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input value="${(s.states || []).join(', ')}" data-slab-states="${s.id}" placeholder="any state" style="width:140px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input value="${(s.pincode_prefixes || []).join(', ')}" data-slab-pincodes="${s.id}" placeholder="any pincode" style="width:120px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="number" min="0" data-slab-min-weight="${s.id}" value="${s.min_weight_grams != null ? s.min_weight_grams : ''}" placeholder="0" style="width:80px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="number" min="0" data-slab-weight="${s.id}" value="${s.max_weight_grams != null ? s.max_weight_grams : ''}" placeholder="catch-all" style="width:90px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="number" min="0" step="0.01" data-slab-min-order="${s.id}" value="${s.min_order_paise != null ? (s.min_order_paise / 100).toFixed(0) : ''}" placeholder="—" style="width:80px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="number" min="0" step="0.01" data-slab-max-order="${s.id}" value="${s.max_order_paise != null ? (s.max_order_paise / 100).toFixed(0) : ''}" placeholder="—" style="width:80px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="number" min="0" step="0.01" data-slab-price="${s.id}" value="${(s.price_paise / 100).toFixed(2)}" style="width:90px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="checkbox" data-slab-active="${s.id}" ${s.is_active === false ? '' : 'checked'} /></td>
      <td style="white-space:nowrap;"><button class="btn btn--outline btn--sm" data-slab-save="${s.id}">Save</button> <button class="btn btn--outline btn--sm" data-slab-delete="${s.id}">Delete</button></td>
    </tr>`;

  const classRow = (c) => `
    <tr data-class-id="${c.id}">
      <td><input value="${escapeAttr(c.name)}" data-class-name="${c.id}" style="width:160px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="number" min="0" step="0.01" data-class-rate="${c.id}" value="${c.flat_rate_paise != null ? (c.flat_rate_paise / 100).toFixed(2) : ''}" placeholder="—" style="width:90px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
      <td><input type="checkbox" data-class-active="${c.id}" ${c.is_active === false ? '' : 'checked'} /></td>
      <td style="white-space:nowrap;"><button class="btn btn--outline btn--sm" data-class-save="${c.id}">Save</button> <button class="btn btn--outline btn--sm" data-class-delete="${c.id}">Delete</button></td>
    </tr>`;

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Shipping classes</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">A named shipping rule an admin can assign to any product (Products → Sale, Shipping &amp; Tags), instead of retyping the same flat charge on each one — e.g. "Fragile - Glass" at a higher flat rate. Only applied to a product whose own "Extra shipping ₹/unit" is left at 0.</p>
      <table class="data-table" style="margin-bottom:12px;">
        <thead><tr><th>Name</th><th>Flat rate ₹ (blank = no override)</th><th>Active</th><th></th></tr></thead>
        <tbody>${shippingClasses.map(classRow).join('') || '<tr><td colspan="4" style="color:var(--moss-700);">No shipping classes yet — add one below.</td></tr>'}</tbody>
      </table>
      <div class="form-row">
        <div class="form-field"><label>Name</label><input id="sc-name" placeholder="e.g. Fragile - Glass" /></div>
        <div class="form-field"><label>Flat rate (₹, optional)</label><input id="sc-rate" type="number" min="0" step="0.01" /></div>
      </div>
      <button class="btn btn--outline btn--sm" id="sc-add">Add Shipping Class</button>
      <p class="form-error" id="sc-error" style="display:none;"></p>
    </div>
    <div class="card" style="margin-bottom:24px;">
      <p style="font-size:0.85rem;color:var(--moss-700);">
        Every rule is optional and AND'd together — leave a field blank to mean "any". A row scoped to no state/pincode/order-value at all is a plain weight-based rate. When more than one row matches an order, the most specific one wins (a state- or pincode-scoped row beats a generic one); ties go to the cheaper row.
        Chargeable weight is the greater of a product's actual weight and its volumetric weight (L × W × H ÷ 5000), pooled across every item in the order that doesn't have its own flat shipping override (a per-product override or a shipping class).
      </p>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Zone name</th><th>States (comma-sep.)</th><th>Pincode prefixes</th><th>Min wt (g)</th><th>Up to wt (g)</th><th>Min order ₹</th><th>Max order ₹</th><th>Price ₹</th><th>Active</th><th></th></tr></thead>
          <tbody>
            ${slabs.map(slabRow).join('') || '<tr><td colspan="10" style="color:var(--moss-700);">No rate slabs yet — add one below.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h3 class="mt-0">Add a rate</h3>
      <div class="form-row">
        <div class="form-field"><label>Zone name (optional, for your own reference)</label><input id="sl-zone" placeholder="e.g. Metro cities" /></div>
        <div class="form-field"><label>Price (₹)</label><input id="sl-price" type="number" min="0" step="0.01" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>States (comma-separated, blank = any)</label><input id="sl-states" placeholder="e.g. Karnataka, Tamil Nadu" /></div>
        <div class="form-field"><label>Pincode prefixes (comma-separated, blank = any)</label><input id="sl-pincodes" placeholder="e.g. 560, 400" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Min weight (g, blank = 0)</label><input id="sl-min-weight" type="number" min="0" /></div>
        <div class="form-field"><label>Up to weight (g, blank = catch-all)</label><input id="sl-weight" type="number" min="0" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Min order value (₹, optional)</label><input id="sl-min-order" type="number" min="0" step="0.01" /></div>
        <div class="form-field"><label>Max order value (₹, optional)</label><input id="sl-max-order" type="number" min="0" step="0.01" /></div>
      </div>
      <button class="btn btn--primary" id="sl-add">Add Rate</button>
      <p class="form-error" id="sl-error" style="display:none;"></p>
    </div>
  `;

  wrap.querySelectorAll('[data-class-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-class-save');
      const name = wrap.querySelector(`[data-class-name="${id}"]`).value.trim();
      const rateRaw = wrap.querySelector(`[data-class-rate="${id}"]`).value.trim();
      const active = wrap.querySelector(`[data-class-active="${id}"]`).checked;
      if (!name) return;
      await api(`/api/shipping/classes/${id}`, {
        method: 'PATCH',
        body: { name, flat_rate_paise: rateRaw === '' ? null : Math.round(parseFloat(rateRaw) * 100), is_active: active },
      });
      btn.textContent = 'Saved';
      setTimeout(() => (btn.textContent = 'Save'), 1500);
    });
  });
  wrap.querySelectorAll('[data-class-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this shipping class? Any product still assigned to it will fall back to its own shipping settings.')) return;
      await api(`/api/shipping/classes/${btn.getAttribute('data-class-delete')}`, { method: 'DELETE' });
      renderShippingRatesTab();
    });
  });
  document.getElementById('sc-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('sc-error');
    errorEl.style.display = 'none';
    const name = document.getElementById('sc-name').value.trim();
    const rateRaw = document.getElementById('sc-rate').value.trim();
    if (!name) {
      errorEl.textContent = 'Name is required.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api('/api/shipping/classes', {
        method: 'POST',
        body: { name, flat_rate_paise: rateRaw === '' ? null : Math.round(parseFloat(rateRaw) * 100) },
      });
      renderShippingRatesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  wrap.querySelectorAll('[data-slab-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-slab-save');
      const weightRaw = wrap.querySelector(`[data-slab-weight="${id}"]`).value.trim();
      const priceRaw = wrap.querySelector(`[data-slab-price="${id}"]`).value.trim();
      const active = wrap.querySelector(`[data-slab-active="${id}"]`).checked;
      await api(`/api/shipping/rate-slabs/${id}`, {
        method: 'PATCH',
        body: {
          max_weight_grams: weightRaw === '' ? null : parseInt(weightRaw, 10),
          price_paise: Math.round((parseFloat(priceRaw) || 0) * 100),
          is_active: active,
          ...readSlabZoneFields(wrap, id),
        },
      });
      btn.textContent = 'Saved';
      setTimeout(() => (btn.textContent = 'Save'), 1500);
    });
  });
  wrap.querySelectorAll('[data-slab-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this rate?')) return;
      await api(`/api/shipping/rate-slabs/${btn.getAttribute('data-slab-delete')}`, { method: 'DELETE' });
      renderShippingRatesTab();
    });
  });
  document.getElementById('sl-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('sl-error');
    errorEl.style.display = 'none';
    const weightRaw = document.getElementById('sl-weight').value.trim();
    const priceRaw = document.getElementById('sl-price').value.trim();
    if (!priceRaw) {
      errorEl.textContent = 'Price is required.';
      errorEl.style.display = 'block';
      return;
    }
    const states = document.getElementById('sl-states').value.split(',').map((s) => s.trim()).filter(Boolean);
    const pincodes = document.getElementById('sl-pincodes').value.split(',').map((s) => s.trim()).filter(Boolean);
    const minOrderRaw = document.getElementById('sl-min-order').value.trim();
    const maxOrderRaw = document.getElementById('sl-max-order').value.trim();
    const minWeightRaw = document.getElementById('sl-min-weight').value.trim();
    await api('/api/shipping/rate-slabs', {
      method: 'POST',
      body: {
        zone_name: document.getElementById('sl-zone').value.trim() || null,
        max_weight_grams: weightRaw === '' ? null : parseInt(weightRaw, 10),
        min_weight_grams: minWeightRaw === '' ? null : parseInt(minWeightRaw, 10),
        price_paise: Math.round(parseFloat(priceRaw) * 100),
        states: states.length ? states : null,
        pincode_prefixes: pincodes.length ? pincodes : null,
        min_order_paise: minOrderRaw === '' ? null : Math.round(parseFloat(minOrderRaw) * 100),
        max_order_paise: maxOrderRaw === '' ? null : Math.round(parseFloat(maxOrderRaw) * 100),
        is_active: true,
      },
    });
    renderShippingRatesTab();
  });
}

const TAB_RENDERERS = {
  dashboard: renderDashboardHomeTab,
  products: renderProductsTab,
  categories: renderCategoriesTab,
  orders: renderOrdersTab,
  customers: renderCustomersTab,
  banners: renderBannersTab,
  content: renderContentTab,
  legal: renderLegalTab,
  coupons: renderCouponsTab,
  shipping: renderShippingRatesTab,
  settings: renderStoreSettingsTab,
  reports: renderReportsTab,
  audit: renderAuditLogTab,
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
  renderDashboardHomeTab();
});
