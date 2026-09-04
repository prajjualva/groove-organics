// Subtle mouse-parallax for the homepage brand-philosophy illustration
// (the coconut/oil-drop artwork that replaced the old orbiting-rings
// graphic). Fine-pointer, motion-OK visitors get a couple of pixels of
// drift toward the cursor; everyone else (touch, reduced-motion) just
// sees the static, still-complete illustration — this script only adds
// a finishing touch, never anything the section depends on.
(function initPhilosophyParallax() {
  const visual = document.getElementById('philosophy-visual');
  const art = document.getElementById('philosophy-art');
  if (!visual || !art) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  if (prefersReducedMotion || !hasFinePointer) return;

  const MAX_OFFSET = 10; // px — kept small, this is a hint of depth, not a gimmick
  const EASE = 0.08;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let raf = null;

  function tick() {
    currentX += (targetX - currentX) * EASE;
    currentY += (targetY - currentY) * EASE;
    art.style.transform = `translate(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px)`;
    if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  }

  function queueTick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  visual.addEventListener('mousemove', (e) => {
    const rect = visual.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    targetX = ((e.clientX - cx) / (rect.width / 2)) * MAX_OFFSET;
    targetY = ((e.clientY - cy) / (rect.height / 2)) * MAX_OFFSET;
    queueTick();
  });

  visual.addEventListener('mouseleave', () => {
    targetX = 0;
    targetY = 0;
    queueTick();
  });
})();
