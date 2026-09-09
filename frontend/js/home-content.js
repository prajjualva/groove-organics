// Homepage: hero image slider, festive-offer/promo cards, and editable
// site copy — all pulled from the admin-managed API instead of being
// hardcoded, so a non-technical admin can change every word and image
// on this page from the dashboard without a developer.
//
// /api/content        -> hero text, story text, feature-strip items, process steps
// /api/banners?placement=homepage_hero  -> the rotating hero background slider
// /api/banners?placement=homepage_promo -> festive-offer / promo card grid

const HERO_SLIDE_INTERVAL_MS = 5500;

// Small line-art icons for the Process section, matched by step position —
// cycles if an admin adds more than 4 steps. Same visual style as the
// feature-strip icons above (24x24, stroke-only, currentColor).
const PROCESS_ICONS = [
  '<path d="M12 21V10"/><path d="M12 10C12 5 16 3 20 3c0 5-3 8-8 8z"/>', // Harvest — sprout
  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v3M12 17v3"/>', // Press — wheel
  '<path d="M4 4h16l-6.5 8v7l-3 1.5v-8.5z"/>', // Settle & Filter — funnel
  '<path d="M10 2h4v3.2l2.2 2.6V20a2 2 0 0 1-2 2h-4.4a2 2 0 0 1-2-2V7.8L10 5.2z"/><path d="M9 12h6"/>', // Bottle
];

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadHeroSlider() {
  const slider = document.getElementById('hero-slider');
  const dotsWrap = document.getElementById('hero-slider-dots');
  const canvas = document.getElementById('hero-canvas');
  if (!slider) return;

  let banners = [];
  try {
    const res = await api('/api/banners?placement=homepage_hero', { auth: false });
    banners = res.banners || [];
  } catch (err) {
    // Network hiccup — the Three.js canvas (or CSS gradient fallback) already
    // covers the background, so just leave it and move on.
    return;
  }
  if (!banners.length) return;

  // Real photo slides take over the hero background — hide the abstract
  // 3D scene so the two don't fight each other, and stop its render loop
  // (it used to keep running invisibly forever otherwise — see hero3d.js).
  if (canvas) {
    canvas.style.display = 'none';
    if (typeof window.__grooveStopHero3D === 'function') window.__grooveStopHero3D();
  }

  // Each banner can optionally carry a separate image_url_mobile (set from
  // Admin → Banners) for a crop that isn't just the desktop photo squeezed
  // into a tall narrow box. This used to be passed to CSS as a custom
  // property (--bg-desktop/--bg-mobile) so a single max-width:768px media
  // query could switch between them with no JS resize listener needed —
  // but banner photos here are uncompressed base64 PNGs several MB each,
  // and Chrome silently drops a CSS custom property once its value gets
  // that large: it computes to an empty string instead of erroring, so
  // background-image: var(--bg-desktop) quietly resolved to nothing and
  // the hero background stayed blank no matter what the API returned.
  // Setting background-image directly (not through a custom property) has
  // no such limit, so the desktop/mobile switch is done here in JS instead,
  // via matchMedia (still no per-resize-event handler needed).
  const heroBgQuery = window.matchMedia('(max-width: 768px)');
  function applyHeroSlideBg(el, b) {
    if (!el || !b) return;
    const isMobile = heroBgQuery.matches;
    const desktopUrl = `url('${b.image_url}')`;
    const mobileUrl = b.image_url_mobile ? `url('${b.image_url_mobile}')` : desktopUrl;
    el.style.backgroundImage = isMobile ? mobileUrl : desktopUrl;
    // Admin-set focus point / fit (Admin → Banners → Focus point / Fit).
    // Small keyword values, not the image data itself, so — unlike
    // background-image above — these are fine to just set as plain inline
    // styles too; no custom-property size concern here.
    el.style.backgroundPosition = b.image_position || 'center center';
    el.style.backgroundSize = b.image_fit || 'cover';

    // Admin → Banners crop/zoom tool: an optional pan + zoom into a focus
    // point, applied by style.css (.hero__slide transform/transform-origin)
    // on top of the base position/size set above. These are small numeric
    // percentages/multipliers, not the image data, so — same reasoning as
    // background-position/-size above, and unlike background-image — they're
    // safe to pass through as CSS custom properties. A banner's mobile crop
    // falls back to its desktop crop when one hasn't been set separately,
    // matching the image_url_mobile fallback above.
    const focusX = isMobile && b.image_focus_x_mobile != null ? b.image_focus_x_mobile : b.image_focus_x;
    const focusY = isMobile && b.image_focus_y_mobile != null ? b.image_focus_y_mobile : b.image_focus_y;
    const zoom = isMobile && b.image_zoom_mobile != null ? b.image_zoom_mobile : b.image_zoom;
    el.style.setProperty('--banner-focus-x', `${focusX != null ? focusX : 50}%`);
    el.style.setProperty('--banner-focus-y', `${focusY != null ? focusY : 50}%`);
    el.style.setProperty('--banner-zoom', String(zoom != null ? zoom : 1));
  }

  slider.innerHTML = banners
    .map((b, i) => `<div class="hero__slide ${i === 0 ? 'is-active' : ''}" data-slide="${i}"></div>`)
    .join('');
  const slideEls = Array.from(slider.querySelectorAll('.hero__slide'));
  slideEls.forEach((el, i) => applyHeroSlideBg(el, banners[i]));
  heroBgQuery.addEventListener('change', () => slideEls.forEach((el, i) => applyHeroSlideBg(el, banners[i])));

  if (banners.length > 1 && dotsWrap) {
    dotsWrap.innerHTML = banners
      .map((_, i) => `<button class="hero__slider-dot ${i === 0 ? 'is-active' : ''}" data-dot="${i}" aria-label="Show slide ${i + 1}"></button>`)
      .join('');
  }

  let current = 0;
  const slides = () => slider.querySelectorAll('.hero__slide');
  const dots = () => (dotsWrap ? dotsWrap.querySelectorAll('.hero__slider-dot') : []);

  function goTo(index) {
    const all = slides();
    if (!all.length) return;
    current = (index + all.length) % all.length;
    all.forEach((el, i) => el.classList.toggle('is-active', i === current));
    dots().forEach((el, i) => el.classList.toggle('is-active', i === current));
  }

  dots().forEach((dot) => {
    dot.addEventListener('click', () => {
      goTo(parseInt(dot.getAttribute('data-dot'), 10));
      resetTimer();
    });
  });

  let timer = null;
  function resetTimer() {
    if (timer) clearInterval(timer);
    if (banners.length > 1) timer = setInterval(() => goTo(current + 1), HERO_SLIDE_INTERVAL_MS);
  }
  resetTimer();
}

async function loadHomepageContent() {
  let content = {};
  try {
    const res = await api('/api/content', { auth: false });
    content = res.content || {};
  } catch (err) {
    return; // hardcoded HTML already in the page is a fine fallback
  }

  const hero = content.homepage_hero;
  if (hero) {
    const tagline = document.getElementById('hero-tagline');
    const headline = document.getElementById('hero-headline');
    const body = document.getElementById('hero-body');
    const ctas = document.getElementById('hero-ctas');
    if (tagline) tagline.textContent = hero.tagline || '';
    if (headline) headline.innerHTML = `${escapeHtml(hero.headline_line1)}<br />${escapeHtml(hero.headline_line2)}`;
    if (body) body.textContent = hero.body || '';
    if (ctas) {
      ctas.innerHTML = `
        ${hero.cta_primary_label ? `<a href="${hero.cta_primary_href || '/shop'}" class="btn btn--primary">${escapeHtml(hero.cta_primary_label)}</a>` : ''}
        ${hero.cta_secondary_label ? `<a href="${hero.cta_secondary_href || '/about'}" class="btn btn--outline">${escapeHtml(hero.cta_secondary_label)}</a>` : ''}
      `;
    }
  }

  const featureStrip = document.getElementById('feature-strip');
  if (featureStrip && content.homepage_feature_strip && Array.isArray(content.homepage_feature_strip.items)) {
    const icons = [
      '<path d="M12 2C8 6 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-3-8-7-12z"/>',
      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
      '<path d="M4 12l5 5L20 6"/>',
      '<path d="M3 21c4-8 8-11 18-13-1 9-6 13-18 13z"/>',
    ];
    featureStrip.innerHTML = content.homepage_feature_strip.items
      .map(
        (item, i) => `
        <div class="feature-strip__item">
          <svg class="feature-strip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">${icons[i % icons.length]}</svg>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.body)}</p>
        </div>`
      )
      .join('');
  }

  // homepage_story (eyebrow/title/body/milestones) used to drive the old
  // "Our Story" timeline section on this page. That section was replaced
  // by a fixed "Our Philosophy" section whose copy lives directly in
  // index.html, on purpose — see the comment there. #story-eyebrow,
  // #story-title, #story-body and #story-milestones no longer exist in
  // this page's markup, so every lookup below is null and this block is
  // an intentional no-op; left in place in case homepage_story content
  // is ever wired to a page again.
  const story = content.homepage_story;
  if (story) {
    const eyebrow = document.getElementById('story-eyebrow');
    const title = document.getElementById('story-title');
    const body = document.getElementById('story-body');
    const milestones = document.getElementById('story-milestones');
    if (eyebrow) eyebrow.textContent = story.eyebrow || '';
    if (title) title.innerHTML = `${escapeHtml(story.title_line1)}<br />${escapeHtml(story.title_line2)}`;
    if (body) body.textContent = story.body || '';
    if (milestones && Array.isArray(story.milestones)) {
      milestones.innerHTML = story.milestones
        .map((m) => `<div class="story__milestone"><span class="mono">${escapeHtml(m.year)}</span><span>${escapeHtml(m.text)}</span></div>`)
        .join('');
    }
  }

  const process = content.homepage_process;
  if (process) {
    const eyebrow = document.getElementById('process-eyebrow');
    const title = document.getElementById('process-title');
    const steps = document.getElementById('process-steps');
    if (eyebrow) eyebrow.textContent = process.eyebrow || '';
    if (title) title.textContent = process.title || '';
    if (steps && Array.isArray(process.steps)) {
      steps.innerHTML = process.steps
        .map(
          (s, i) =>
            `<div class="process__row reveal"><svg class="process__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">${PROCESS_ICONS[i % PROCESS_ICONS.length]}</svg><span class="mono">${String(i + 1).padStart(2, '0')}</span><h4>${escapeHtml(s.title)}</h4><p>${escapeHtml(s.body)}</p></div>`
        )
        .join('');
      // These rows are brand-new DOM nodes created after the page's initial
      // scroll-reveal scan (see partials.js) — re-arm it so they actually
      // fade in instead of staying invisible forever.
      if (typeof initScrollReveal === 'function') initScrollReveal();
    }
  }
}

async function loadPromoBanners() {
  const section = document.getElementById('promo-section');
  const grid = document.getElementById('promo-grid');
  if (!section || !grid) return;
  try {
    const { banners } = await api('/api/banners?placement=homepage_promo', { auth: false });
    if (!banners || !banners.length) return;
    grid.innerHTML = banners
      .map(
        (b, i) => `
        <a class="promo-card" href="${b.link_url || '#'}">
          <div class="promo-card__image" data-promo="${i}"></div>
          <div class="promo-card__text">
            ${b.title ? `<h4>${escapeHtml(b.title)}</h4>` : ''}
            ${b.subtitle ? `<p>${escapeHtml(b.subtitle)}</p>` : ''}
          </div>
        </a>`
      )
      .join('');
    // See the matching comment in loadHeroSlider above: background-image is
    // set directly here (not via a CSS custom property) because Chrome
    // silently drops a custom property's value once it reaches the
    // multi-megabyte range, which every one of these base64 banner photos does.
    const promoBgQuery = window.matchMedia('(max-width: 768px)');
    const imageEls = Array.from(grid.querySelectorAll('.promo-card__image'));
    function applyPromoBg() {
      const isMobile = promoBgQuery.matches;
      imageEls.forEach((el, i) => {
        const b = banners[i];
        if (!b) return;
        const desktopUrl = `url('${b.image_url}')`;
        const mobileUrl = b.image_url_mobile ? `url('${b.image_url_mobile}')` : desktopUrl;
        el.style.backgroundImage = isMobile ? mobileUrl : desktopUrl;
        el.style.backgroundPosition = b.image_position || 'center center';
        el.style.backgroundSize = b.image_fit || 'cover';

        // Crop/zoom tool — see the matching comment in loadHeroSlider above.
        const focusX = isMobile && b.image_focus_x_mobile != null ? b.image_focus_x_mobile : b.image_focus_x;
        const focusY = isMobile && b.image_focus_y_mobile != null ? b.image_focus_y_mobile : b.image_focus_y;
        const zoom = isMobile && b.image_zoom_mobile != null ? b.image_zoom_mobile : b.image_zoom;
        el.style.setProperty('--banner-focus-x', `${focusX != null ? focusX : 50}%`);
        el.style.setProperty('--banner-focus-y', `${focusY != null ? focusY : 50}%`);
        el.style.setProperty('--banner-zoom', String(zoom != null ? zoom : 1));
      });
    }
    applyPromoBg();
    promoBgQuery.addEventListener('change', applyPromoBg);
    section.style.display = '';
  } catch (err) {
    // No promo banners set up yet — leave the section hidden.
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadHeroSlider();
  loadHomepageContent();
  loadPromoBanners();
});
