// One template for every legal page (/terms, /privacy, /refund-policy,
// /shipping-policy) — the content itself comes from the site_content keys
// page_terms / page_privacy / page_refund_policy / page_shipping_policy,
// editable from Admin without touching code (same pattern as Homepage
// Content — see backend/routes/content.js).

const LEGAL_PAGE_KEYS = {
  '/terms': 'page_terms',
  '/privacy': 'page_privacy',
  '/refund-policy': 'page_refund_policy',
  '/shipping-policy': 'page_shipping_policy',
};

function escapeHtmlLegal(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderLegalPage() {
  const wrap = document.getElementById('legal-content');
  const key = LEGAL_PAGE_KEYS[window.location.pathname] || 'page_terms';
  try {
    const { content } = await api('/api/content', { auth: false });
    const page = content[key] || { title: 'Legal', body: '' };
    document.title = `${page.title} — Groove Organics`;
    const paragraphs = String(page.body || '')
      .split('\n\n')
      .map((p) => `<p>${escapeHtmlLegal(p).replace(/\n/g, '<br />')}</p>`)
      .join('');
    wrap.innerHTML = `<span class="eyebrow">Legal</span><h1>${escapeHtmlLegal(page.title)}</h1>${paragraphs}`;
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state">Could not load this page right now.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderSiteChrome('');
  renderLegalPage();
});
