// FAQ page — a real linkable page with an accordion (not a flat wall of
// legal-page text). Content comes from the site_content key "page_faq",
// editable from Admin without touching code, same pattern as the legal
// pages (page_terms etc. — see legal.js) and the homepage content blocks.

function escapeHtmlFaq(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderFaqPage() {
  const wrap = document.getElementById('faq-content');
  try {
    const { content } = await api('/api/content', { auth: false });
    const page = content.page_faq || { title: 'Frequently Asked Questions', items: [] };
    document.title = `${page.title} — Groove Organics`;
    const items = Array.isArray(page.items) ? page.items : [];
    wrap.innerHTML = `
      <span class="eyebrow">Help</span>
      <h1>${escapeHtmlFaq(page.title)}</h1>
      <div class="pdp-faq" style="margin-top:24px;">
        ${
          items.length
            ? items
                .map(
                  (f) => `<details class="pdp-faq__item"><summary class="pdp-faq__q">${escapeHtmlFaq(f.question)}</summary><div class="pdp-faq__a">${escapeHtmlFaq(f.answer)}</div></details>`
                )
                .join('')
            : '<p style="color:var(--moss-700);">No questions added yet.</p>'
        }
      </div>
      <p style="margin-top:32px;color:var(--moss-700);">Still have a question? <a href="/contact" style="text-decoration:underline;">Contact us</a>.</p>
    `;
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state">Could not load this page right now.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderSiteChrome('');
  renderFaqPage();
});
