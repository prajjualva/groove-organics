// Generic renderer for admin-created CMS pages (Admin Phase 7 -> Pages tab).
// One template (page.html + this file) serves every page an admin creates
// at /p/:slug — the slug comes straight off the URL path, same idea as
// legal.js reading window.location.pathname for the 4 fixed legal pages,
// just with the slug as the last path segment instead of a fixed lookup
// table (there's no fixed set of these — an admin can add any number).

function escapeHtmlPage(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderCmsPage() {
  const wrap = document.getElementById('page-content');
  const parts = window.location.pathname.split('/').filter(Boolean); // ['p', 'slug']
  const slug = parts[parts.length - 1] || '';

  if (!slug) {
    wrap.innerHTML = '<div class="empty-state">Page not found.</div>';
    return;
  }

  try {
    const { page } = await api(`/api/pages/${encodeURIComponent(slug)}`, { auth: false });
    document.title = `${page.seo_title || page.title} — Groove Organics`;
    if (page.seo_meta_description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', page.seo_meta_description);
    }
    const paragraphs = String(page.body || '')
      .split('\n\n')
      .map((p) => `<p>${escapeHtmlPage(p).replace(/\n/g, '<br />')}</p>`)
      .join('');
    wrap.innerHTML = `<h1>${escapeHtmlPage(page.title)}</h1>${paragraphs}`;
  } catch (err) {
    // 404 (page not found or not yet published) and any network error both
    // land here — same "couldn't load, no scary stack trace" empty state
    // legal.js already uses.
    wrap.innerHTML = '<div class="empty-state">This page could not be found.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderSiteChrome('');
  renderCmsPage();
});
