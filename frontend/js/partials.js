// Shared nav + footer, rendered into every page from one place so the
// design only has to be maintained in a single file. Each page includes:
//   <div id="nav-root"></div>  ... <div id="footer-root"></div>
// and this script, then calls renderNav('shop') / renderFooter().

// Real uploaded brand logo — lives at frontend/assets/logo.png. Swap that
// file from the Desktop project folder any time to update the logo
// everywhere on the site (nav + footer both use this one constant).
const LOGO_SVG = `<img src="/assets/logo.png" alt="Groove Organics" class="brand-logo" />`;

// Escapes admin-entered text (Navigation editor link labels/hrefs) before it
// goes into innerHTML on every page's live nav/footer. This content is
// admin/staff-authored, not visitor-authored, but every other admin-entered
// string already rendered into customer-facing HTML in this app (banner
// titles, homepage copy — see home-content.js's own escapeHtml) is escaped
// the same way, as protection against a compromised or careless staff
// account rather than an untrusted-visitor threat model.
function escapeHtmlNav(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Admin Phase 7 (Navigation editor): the primary link set, as plain
// [href, label, key] tuples — Home stays first and fixed (matches "Home"
// having no admin-editable row anywhere else in this app either), Shop/Our
// Story/Contact are the admin-editable defaults (see dataStore.js's
// DEFAULT_CONTENT.nav_header), and Deals stays a fixed pill in the icon
// cluster (a deliberate, non-editable design choice from the customer-
// website audit — see the comment where it's rendered below), not a plain
// link an admin could accidentally demote back into the icon cluster or
// remove. NAV_HEADER_LINKS is mutable module state so an async content
// fetch can override just the middle 3 without touching Home/Deals — see
// applyNavContentOverrides() at the bottom of this file.
let NAV_HEADER_LINKS = [
  ['/shop', 'Shop', 'shop'],
  ['/about', 'Our Story', 'about'],
  ['/contact', 'Contact', 'contact'],
];
let NAV_ACTIVE_KEY = '';

function renderNavLinksOnly() {
  const links = [['/', 'Home', ''], ...NAV_HEADER_LINKS];
  const linkHtml = (mobile) =>
    links
      .map(
        ([href, label, key]) =>
          `<a href="${escapeHtmlNav(href)}"${key === NAV_ACTIVE_KEY ? ' aria-current="page"' : ''}>${escapeHtmlNav(label)}</a>`
      )
      .join('') + (mobile ? `<a href="/deals"${NAV_ACTIVE_KEY === 'deals' ? ' aria-current="page"' : ''}>Deals</a>` : '');
  const desktopEl = document.querySelector('.nav__links');
  const mobileEl = document.getElementById('nav-mobile');
  if (desktopEl) desktopEl.innerHTML = linkHtml(false);
  if (mobileEl) mobileEl.innerHTML = linkHtml(true);
}

function renderNav(active = '') {
  const root = document.getElementById('nav-root');
  if (!root) return;
  NAV_ACTIVE_KEY = active;
  // "Deals" was previously a primary nav item alongside Shop/Our Story —
  // per the customer-website audit (§4b), that reads as discount-store
  // energy in prime nav real estate for a "premium simplicity" brand. It
  // still gets a real, easy-to-find link (a small pill in the icon
  // cluster, styled distinctly from the icon buttons) rather than being
  // removed outright.
  const links = [['/', 'Home', ''], ...NAV_HEADER_LINKS];
  const linkHtml = (mobile) =>
    links
      .map(
        ([href, label, key]) =>
          `<a href="${escapeHtmlNav(href)}"${key === active ? ' aria-current="page"' : ''}>${escapeHtmlNav(label)}</a>`
      )
      .join('') + (mobile ? `<a href="/deals"${active === 'deals' ? ' aria-current="page"' : ''}>Deals</a>` : '');

  root.innerHTML = `
    <nav class="nav" id="site-nav">
      <div class="container nav__inner">
        <a href="/" class="nav__brand">
          ${LOGO_SVG}
          <span>GROOVE Organics<span class="nav__tagline">Goodness of Earth</span></span>
        </a>
        <ul class="nav__links">${linkHtml(false)}</ul>
        <div class="nav__icons">
          <a href="/deals" class="nav__deals-pill"${active === 'deals' ? ' aria-current="page"' : ''}>Deals</a>
          <button class="nav__icon-btn" id="nav-search-btn" aria-label="Search products" aria-haspopup="dialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          </button>
          <a href="/wishlist" class="nav__icon-btn" aria-label="Wishlist">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
          </a>
          <a href="${typeof getAuthUser === 'function' && getAuthUser() ? '/account/dashboard' : '/account'}" class="nav__icon-btn" aria-label="Account">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>
          </a>
          <a href="/cart" class="nav__icon-btn" aria-label="Cart">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
            <span class="nav__cart-count" id="nav-cart-count" hidden>0</span>
          </a>
          <button class="nav__toggle" id="nav-toggle" aria-label="Menu" aria-expanded="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
        </div>
      </div>
      <ul class="nav__mobile" id="nav-mobile">${linkHtml(true)}</ul>
    </nav>
  `;

  const nav = document.getElementById('site-nav');
  const toggle = document.getElementById('nav-toggle');
  const mobile = document.getElementById('nav-mobile');
  toggle.addEventListener('click', () => {
    const open = mobile.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  function onScroll() {
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.getElementById('nav-search-btn').addEventListener('click', openSearchPanel);

  updateCartBadge();
}

// --- Site search: a lightweight overlay panel, backed by the same public
// /api/products list the Shop page already uses — no new backend endpoint,
// a plain case-insensitive substring match on name/short_description. The
// catalog is small today (per the audit, real search infra is lower
// priority until it grows), so this is intentionally simple rather than a
// server-side search endpoint. ---
let SEARCH_PRODUCTS_CACHE = null;

function ensureSearchPanel() {
  if (document.getElementById('site-search-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'site-search-panel';
  panel.className = 'search-panel';
  panel.innerHTML = `
    <div class="search-panel__box" role="dialog" aria-modal="true" aria-label="Search products">
      <button type="button" class="search-panel__close" id="search-panel-close" aria-label="Close search">×</button>
      <label class="visually-hidden" for="search-panel-input">Search products</label>
      <input id="search-panel-input" type="search" placeholder="Search oils…" autocomplete="off" />
      <div class="search-panel__results" id="search-panel-results"></div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener('click', (e) => {
    if (e.target === panel) closeSearchPanel();
  });
  document.getElementById('search-panel-close').addEventListener('click', closeSearchPanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) closeSearchPanel();
  });

  document.getElementById('search-panel-input').addEventListener('input', async (e) => {
    const q = e.target.value.trim().toLowerCase();
    const resultsEl = document.getElementById('search-panel-results');
    if (!q) {
      resultsEl.innerHTML = '';
      return;
    }
    if (!SEARCH_PRODUCTS_CACHE) {
      try {
        const { products } = await api('/api/products', { auth: false });
        SEARCH_PRODUCTS_CACHE = products;
      } catch {
        SEARCH_PRODUCTS_CACHE = [];
      }
    }
    const matches = SEARCH_PRODUCTS_CACHE.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.short_description || '').toLowerCase().includes(q)
    ).slice(0, 8);
    resultsEl.innerHTML = matches.length
      ? matches
          .map(
            (p) => `
        <a class="search-result" href="/product?slug=${encodeURIComponent(p.slug)}">
          ${p.image_url ? `<img src="${p.image_url}" alt="" />` : '<span class="search-result-noimg" aria-hidden="true"></span>'}
          <span>${p.name}</span>
        </a>`
          )
          .join('')
      : `<p class="search-panel__empty">No products match “${q}”.</p>`;
  });
}

function openSearchPanel() {
  ensureSearchPanel();
  const panel = document.getElementById('site-search-panel');
  panel.classList.add('open');
  document.getElementById('search-panel-input').value = '';
  document.getElementById('search-panel-results').innerHTML = '';
  setTimeout(() => document.getElementById('search-panel-input').focus(), 0);
}

function closeSearchPanel() {
  document.getElementById('site-search-panel')?.classList.remove('open');
}

// Admin Phase 7 (Navigation editor): the two footer link columns as plain
// {label, href} lists — see dataStore.js's DEFAULT_CONTENT.nav_footer.
// Mutable module state for the same reason as NAV_HEADER_LINKS above: an
// async content fetch can override these without re-rendering (and
// re-binding the newsletter form inside) the whole footer.
let NAV_FOOTER_SHOP = [
  { label: 'All Oils', href: '/shop' },
  { label: 'Deals', href: '/deals' },
  { label: 'Coming Soon', href: '/shop' },
];
let NAV_FOOTER_COMPANY = [
  { label: 'Our Story', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Refunds', href: '/refund-policy' },
  { label: 'Shipping', href: '/shipping-policy' },
];

function footerColumnLinksHtml(items) {
  return items.map((l) => `<li><a href="${escapeHtmlNav(l.href)}">${escapeHtmlNav(l.label)}</a></li>`).join('');
}

function renderFooterColumnsOnly() {
  const shopEl = document.querySelector('[data-footer-col="shop"]');
  const companyEl = document.querySelector('[data-footer-col="company"]');
  if (shopEl) shopEl.innerHTML = footerColumnLinksHtml(NAV_FOOTER_SHOP);
  if (companyEl) companyEl.innerHTML = footerColumnLinksHtml(NAV_FOOTER_COMPANY);
}

function renderFooter() {
  const root = document.getElementById('footer-root');
  if (!root) return;
  root.innerHTML = `
    <footer class="footer">
      <div class="container">
        <div class="footer__top">
          <div>
            <div class="footer__brand">${LOGO_SVG}<span>GROOVE Organics</span></div>
            <p class="muted">Pure by nature, trusted by you. Cold-pressed oils and organic living essentials, small-batch made.</p>
          </div>
          <div class="footer__col">
            <h4>Shop</h4>
            <ul data-footer-col="shop">${footerColumnLinksHtml(NAV_FOOTER_SHOP)}</ul>
          </div>
          <div class="footer__col">
            <h4>Company</h4>
            <ul data-footer-col="company">${footerColumnLinksHtml(NAV_FOOTER_COMPANY)}</ul>
          </div>
          <div class="footer__col">
            <h4>Stay in the loop</h4>
            <p>Get 10% off your first order.</p>
            <form class="footer__newsletter-form" id="newsletter-form">
              <label class="visually-hidden" for="newsletter-email">Email address</label>
              <input id="newsletter-email" type="email" placeholder="you@email.com" required />
              <button class="btn btn--primary btn--sm" type="submit">Join</button>
            </form>
            <p class="form-success" id="newsletter-success" style="display:none;margin-top:10px;" aria-live="polite">Thanks — check your inbox for your code.</p>
          </div>
        </div>
        <div class="footer__bottom">
          <span>&copy; ${new Date().getFullYear()} Groove Organics. All rights reserved.</span>
          <span>Made with care, shipped across India.</span>
        </div>
      </div>
    </footer>
  `;

  const form = document.getElementById('newsletter-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('newsletter-email').value;
    try {
      await api('/api/newsletter', { method: 'POST', body: { email } });
      form.style.display = 'none';
      // Re-set textContent (not just style.display) so aria-live actually
      // announces this to screen readers, not just a display toggle on
      // otherwise-unchanged text.
      const successEl = document.getElementById('newsletter-success');
      successEl.textContent = 'Thanks — check your inbox for your code.';
      successEl.style.display = 'block';
    } catch (err) {
      alert(err.message || 'Something went wrong — please try again.');
    }
  });
}

// Injects a "Skip to content" link once per page load, for keyboard/screen-
// reader users to jump past the nav. Pairs with id="main-content" on each
// page's first real content landmark.
function ensureSkipLink() {
  if (document.querySelector('.skip-link')) return;
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = '#main-content';
  link.textContent = 'Skip to content';
  document.body.insertBefore(link, document.body.firstChild);
}

// Renders the shared nav + footer defensively: a failure in one never blocks
// the other, or the page's own subsequent data-loading code. Before this,
// an uncaught error inside renderNav/renderFooter (or an unrelated boot
// error) could leave a page stuck on its initial "Loading…" state forever,
// since nothing after that line in the page's DOMContentLoaded handler
// would ever run. Call this instead of renderNav()+renderFooter() directly.
function renderSiteChrome(active = '') {
  try {
    ensureSkipLink();
  } catch (err) {
    console.error('Skip link failed to render', err);
  }
  try {
    renderNav(active);
  } catch (err) {
    console.error('Nav failed to render', err);
  }
  try {
    renderFooter();
  } catch (err) {
    console.error('Footer failed to render', err);
  }
  // Admin Phase 7 (Navigation editor): fires after the synchronous default
  // render above, never before it — every page's nav/footer paints
  // instantly with the built-in defaults exactly as before this feature
  // existed, then this quietly patches in an admin's customizations (if
  // any) a moment later. Deliberately does NOT re-render the whole nav/
  // footer (which would re-bind the toggle/search/scroll listeners and the
  // newsletter form a second time) — it only ever swaps the innerHTML of
  // the link lists themselves, via renderNavLinksOnly()/
  // renderFooterColumnsOnly() above.
  applyNavContentOverrides(active).catch((err) => console.error('Nav content overrides failed to load', err));
}

async function applyNavContentOverrides(active) {
  if (typeof api !== 'function') return;
  const { content } = await api('/api/content', { auth: false });
  const headerLinks = content.nav_header && Array.isArray(content.nav_header.links) ? content.nav_header.links : null;
  if (headerLinks && headerLinks.length) {
    NAV_HEADER_LINKS = headerLinks.map((l) => [l.href, l.label, '']); // no admin-set key currently maps to an aria-current match; acceptable — aria-current only ever applied to Home/Deals anyway once customized
    NAV_ACTIVE_KEY = active;
    renderNavLinksOnly();
  }
  const footer = content.nav_footer;
  if (footer && Array.isArray(footer.shop) && footer.shop.length) {
    NAV_FOOTER_SHOP = footer.shop;
  }
  if (footer && Array.isArray(footer.company) && footer.company.length) {
    NAV_FOOTER_COMPANY = footer.company;
  }
  if (footer) renderFooterColumnsOnly();
}

function updateCartBadge() {
  const badge = document.getElementById('nav-cart-count');
  if (!badge) return;
  const count = getCart().reduce((sum, i) => sum + i.quantity, 0);
  if (count > 0) {
    badge.textContent = String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// Scroll-reveal: add .reveal to any element, it fades/slides in once visible.
// Safe to call more than once (e.g. after async content like home-content.js
// rebuilds part of the page) — only newly-added, not-yet-bound .reveal
// elements are picked up each time, via the data-reveal-bound marker.
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal:not([data-reveal-bound])');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => {
    el.setAttribute('data-reveal-bound', '');
    obs.observe(el);
  });
}

document.addEventListener('DOMContentLoaded', initScrollReveal);
