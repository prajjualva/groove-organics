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
      .join('');

  root.innerHTML = `
    <nav class="nav" id="site-nav">
      <div class="container nav__inner">
        <a href="/" class="nav__brand">
          ${LOGO_SVG}
          <span>GROOVE Organics<span class="nav__tagline">Goodness of Earth</span></span>
        </a>
        <ul class="nav__links">${linkHtml(false)}</ul>
        <div class="nav__icons">
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

  updateCartBadge();
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
              <li><a href="/shop">Bestsellers</a></li>
              <li><a href="/shop">Coming Soon</a></li>
            </ul>
          </div>
          <div class="footer__col">
            <h4>Company</h4>
            <ul>
              <li><a href="/about">Our Story</a></li>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/admin">Admin</a></li>
              <li><a href="/staff">Staff</a></li>
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
            <p class="form-success" id="newsletter-success" style="display:none;margin-top:10px;">Thanks — check your inbox for your code.</p>
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
      document.getElementById('newsletter-success').style.display = 'block';
    } catch (err) {
      alert(err.message || 'Something went wrong — please try again.');
    }
  });
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
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
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
  items.forEach((el) => obs.observe(el));
}

document.addEventListener('DOMContentLoaded', initScrollReveal);
