// Shared nav + footer, rendered into every page from one place so the
// design only has to be maintained in a single file. Each page includes:
//   <div id="nav-root"></div>  ... <div id="footer-root"></div>
// and this script, then calls renderNav('shop') / renderFooter().

// Real uploaded brand logo — lives at frontend/assets/logo.png. Swap that
// file from the Desktop project folder any time to update the logo
// everywhere on the site (nav + footer both use this one constant).
const LOGO_SVG = `<img src="/assets/logo.png" alt="Groove Organics" class="brand-logo" />`;

function renderNav(active = '') {
  const root = document.getElementById('nav-root');
  if (!root) return;
  // "Deals" was previously a primary nav item alongside Shop/Our Story —
  // per the customer-website audit (§4b), that reads as discount-store
  // energy in prime nav real estate for a "premium simplicity" brand. It
  // still gets a real, easy-to-find link (a small pill in the icon
  // cluster, styled distinctly from the icon buttons) rather than being
  // removed outright.
  const links = [
    ['/', 'Home', ''],
    ['/shop', 'Shop', 'shop'],
    ['/about', 'Our Story', 'about'],
    ['/contact', 'Contact', 'contact'],
  ];
  const linkHtml = (mobile) =>
    links
      .map(
        ([href, label, key]) =>
          `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`
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
            <ul>
              <li><a href="/shop">All Oils</a></li>
              <li><a href="/deals">Deals</a></li>
              <li><a href="/shop">Coming Soon</a></li>
            </ul>
          </div>
          <div class="footer__col">
            <h4>Company</h4>
            <ul>
              <li><a href="/about">Our Story</a></li>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/faq">FAQ</a></li>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/privacy">Privacy</a></li>
              <li><a href="/refund-policy">Refunds</a></li>
              <li><a href="/shipping-policy">Shipping</a></li>
            </ul>
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
