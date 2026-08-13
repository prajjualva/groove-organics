// 3D orbiting hero scene (Three.js): stylized "ingredient" shapes — a seed
// pod, a berry, a grain nugget — drifting on faint ring paths behind the
// headline. Reacts gently to mouse movement, fades on scroll.
// Falls back to a static CSS gradient (already set on .hero) if Three.js
// fails to load (e.g. offline, blocked script) or the visitor prefers
// reduced motion — the hero still reads fine either way.

(function initHero3D() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || typeof THREE === 'undefined') {
    canvas.style.display = 'none';
    return;
  }

  const hero = document.querySelector('.hero');
  let width = hero.clientWidth;
  let height = hero.clientHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 12);

  const ambient = new THREE.AmbientLight(0xf1e9da, 0.7);
  const point = new THREE.PointLight(0xc9a227, 1.4, 50);
  point.position.set(6, 6, 10);
  scene.add(ambient, point);

  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.2 });
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xb5551d, roughness: 0.5, metalness: 0.1 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x44573a, roughness: 0.6, metalness: 0.05 });

  // "Ingredient" shapes: seed pod (capsule), berry (sphere), grain nugget (icosahedron)
  const shapes = [
    { mesh: new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1, 4, 8), goldMat), radius: 4.2, speed: 0.09, tilt: 0.3, phase: 0 },
    { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), clayMat), radius: 3.1, speed: -0.13, tilt: -0.4, phase: 2 },
    { mesh: new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mossMat), radius: 5.2, speed: 0.07, tilt: 0.15, phase: 4 },
    { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), goldMat), radius: 2.2, speed: -0.17, tilt: 0.5, phase: 1 },
    { mesh: new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), clayMat), radius: 4.8, speed: 0.1, tilt: -0.2, phase: 3 },
  ];
  shapes.forEach((s) => scene.add(s.mesh));

  // Faint ring paths
  const ringGroup = new THREE.Group();
  [2.2, 3.1, 4.2, 4.8, 5.2].forEach((r) => {
    const ringGeo = new THREE.RingGeometry(r - 0.006, r + 0.006, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbf6ec, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    ringGroup.add(ring);
  });
  scene.add(ringGroup);

  let mouseX = 0;
  let mouseY = 0;
  window.addEventListener(
    'mousemove',
    (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  let scrollFade = 1;
  window.addEventListener(
    'scroll',
    () => {
      const fade = 1 - Math.min(window.scrollY / (height * 0.8), 1);
      scrollFade = fade;
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    width = hero.clientWidth;
    height = hero.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    shapes.forEach((s) => {
      const angle = t * s.speed + s.phase;
      s.mesh.position.x = Math.cos(angle) * s.radius;
      s.mesh.position.z = Math.sin(angle) * s.radius * 0.4;
      s.mesh.position.y = Math.sin(angle * 1.3) * s.tilt * 2;
      s.mesh.rotation.x += 0.004;
      s.mesh.rotation.y += 0.006;
    });

    camera.position.x += (mouseX * 1.4 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 0.8 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    renderer.domElement.style.opacity = String(scrollFade);
    renderer.render(scene, camera);
  }
  animate();
})();
