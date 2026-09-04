// "The Journey of the Oil" — real wood-press video loop for the process
// section. Deliberately simple compared to process3d.js: the <video poster>
// attribute is itself a finished, fully-composed frame of the same footage
// (title, stage labels, logo all baked in), so there is no separate
// fallback state to build or toggle — this script only ever decides
// whether to start playback, never which markup to show.
//
// - Lazy: playback doesn't start (and the video isn't even requested,
//   preload="none") until the section is close to the viewport.
// - Respects prefers-reduced-motion by simply never calling .play() —
//   the poster frame stays put, which already looks like a real shot.
// - Pauses when scrolled away so it isn't decoding video off-screen.
(function initProcessVideo() {
  const section = document.getElementById('process-video-section');
  const video = document.getElementById('process-video-media');
  if (!section || !video) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return; // poster frame is the whole experience here

  video.muted = true;
  video.playsInline = true;

  let started = false;
  function start() {
    if (started) return;
    started = true;
    video.preload = 'auto';
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay blocked by the browser — the poster frame is a real,
        // finished shot, so this is a fine place to just stay.
        started = false;
      });
    }
  }

  if (!('IntersectionObserver' in window)) {
    // No IO support — just let the poster frame stand; that's still a
    // complete, good-looking result, not a broken one.
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          start();
        } else if (started) {
          video.pause();
        }
      });
    },
    { rootMargin: '400px 0px' }
  );
  observer.observe(section);
})();
