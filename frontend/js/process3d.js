// "The Journey of the Oil" — a scroll-driven Three.js miniature diorama:
// coconuts -> traditional wooden chekku press -> glass settling vessel ->
// Groove Organics bottle, laid out left-to-right. The camera dollies along
// this small scene as the visitor scrolls through a tall pinned section,
// with a little cursor parallax on top.
//
// This is a stylized, atmospheric interpretation — not an attempt at
// photorealism. Everything is built from primitive geometry plus small
// canvas-generated textures (wood grain, stone speckle, a soft glow), so
// there are no external model/texture files to fetch or fail to load —
// important since this app has no build step and nothing to bundle.
//
// Progressive enhancement: index.html always ships the plain icon+copy
// section (#process-fallback) already visible by default. This script only
// swaps the section over to the 3D experience once it has confirmed WebGL
// actually works, the viewport is wide enough, and the visitor hasn't asked
// for reduced motion — and even then, only once the section is close to the
// viewport (lazy init via IntersectionObserver), with a short frame-rate
// watchdog that falls back to the plain section if the device is struggling.

(function initProcess3D() {
  const section = document.getElementById('process3d-section');
  const scroller = document.getElementById('process3d-scroller');
  const viewport = section ? section.querySelector('.process3d__viewport') : null;
  const fallback = document.getElementById('process-fallback');
  const canvas = document.getElementById('process3d-canvas');
  if (!section || !scroller || !viewport || !fallback || !canvas) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrowViewport = window.innerWidth < 860;

  function supportsWebGL() {
    try {
      const test = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (test.getContext('webgl') || test.getContext('experimental-webgl')));
    } catch (err) {
      return false;
    }
  }

  if (prefersReducedMotion || narrowViewport || typeof THREE === 'undefined' || !supportsWebGL()) {
    return; // fallback section stays visible, scroller stays display:none (CSS default)
  }

  // ---------------------------------------------------------------------
  // Small procedural texture helpers — no image files needed.
  // ---------------------------------------------------------------------
  function canvasTexture(draw, size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    draw(c.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function woodTexture(base, grain) {
    return canvasTexture((ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = grain;
      ctx.globalAlpha = 0.32;
      for (let i = 0; i < 22; i++) {
        let y = Math.random() * s;
        ctx.lineWidth = 0.6 + Math.random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= s; x += 22) {
          y += (Math.random() - 0.5) * 9;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, 'rgba(0,0,0,0.1)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    }, 256);
  }

  function stoneTexture() {
    return canvasTexture((ctx, s) => {
      ctx.fillStyle = '#8f8577';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = Math.random() * 1.4;
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 256);
  }

  function leafTexture() {
    return canvasTexture((ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#3c4f30';
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.2, s * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.08);
      ctx.lineTo(s / 2, s * 0.92);
      ctx.stroke();
    }, 64);
  }

  function glowTexture() {
    return canvasTexture((ctx, s) => {
      const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,224,140,0.9)');
      grad.addColorStop(0.4, 'rgba(255,200,90,0.32)');
      grad.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    }, 128);
  }

  function flowTexture() {
    return canvasTexture((ctx, s) => {
      ctx.fillStyle = '#e9b93a';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (let y = 0; y < s; y += 9) ctx.fillRect(0, y, s, 3);
    }, 64);
  }

  function labelTexture() {
    return canvasTexture((ctx, s) => {
      ctx.fillStyle = '#fbf6ec';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1b2416';
      ctx.textAlign = 'center';
      ctx.font = '600 20px Georgia, serif';
      ctx.fillText('GROOVE', s / 2, s * 0.44);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#556b45';
      ctx.fillText('ORGANICS', s / 2, s * 0.58);
    }, 128);
  }

  // ---------------------------------------------------------------------
  // Scene object builders — a small "diorama" laid out along local X.
  // ---------------------------------------------------------------------
  function buildPressAssembly() {
    const group = new THREE.Group();
    const woodDark = new THREE.MeshStandardMaterial({ map: woodTexture('#5b3d24', '#2f2013'), roughness: 0.85, metalness: 0.05 });
    const woodMid = new THREE.MeshStandardMaterial({ map: woodTexture('#7a5230', '#4a331d'), roughness: 0.8, metalness: 0.05 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.4, metalness: 0.75 });

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 1.05, 22), woodDark);
    drum.position.y = 0.55;
    group.add(drum);

    [1.0, 0.22].forEach((y) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.045, 8, 28), metal);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      group.add(band);
    });

    // Rotating mechanism: center pole + cross beam, spins slowly and
    // continuously to read as "the press operating".
    const mech = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.3, 12), woodMid);
    pole.position.y = 1.55;
    mech.add(pole);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.13, 0.13), woodMid);
    beam.position.y = 2.4;
    mech.add(beam);
    const beamCap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), metal);
    beamCap.position.set(1.05, 2.4, 0);
    mech.add(beamCap);
    group.add(mech);

    const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.36), woodDark);
    outlet.position.set(1.05, 0.14, 0);
    group.add(outlet);

    group.userData.mechanism = mech;
    group.userData.hotspotLabel = 'Traditional chekku press';
    group.userData.hotspotMesh = drum;
    return group;
  }

  function buildCoconutCluster() {
    const group = new THREE.Group();
    const husk = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.95 });
    const flesh = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.9 });
    const positions = [
      [-0.3, 0.22, 0.1],
      [0.25, 0.2, -0.15],
      [0, 0.5, 0],
      [0.42, 0.22, 0.28],
    ];
    let centerMesh = null;
    positions.forEach((p, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), husk);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.scale.y = 0.92;
      group.add(mesh);
      if (i === 2) {
        centerMesh = mesh;
        const half = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10, 0, Math.PI), flesh);
        half.position.set(p[0], p[1] + 0.02, p[2] + 0.02);
        half.rotation.y = Math.PI / 3;
        group.add(half);
      }
    });
    group.userData.hotspotLabel = 'Coconut, hand-picked';
    group.userData.hotspotMesh = centerMesh;
    return group;
  }

  function buildVessel() {
    const group = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transmission: 1, thickness: 0.4, roughness: 0.06,
      ior: 1.45, transparent: true, opacity: 1, side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.85, 22, 1, true), glass);
    body.position.y = 0.43;
    group.add(body);

    const oil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.44, 0.5, 22),
      new THREE.MeshPhysicalMaterial({ color: 0xd9a520, transmission: 0.55, roughness: 0.15, ior: 1.4, transparent: true, opacity: 0.92 })
    );
    oil.position.y = 0.28;
    group.add(oil);

    const cloth = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 20),
      new THREE.MeshStandardMaterial({ color: 0xf1e9da, roughness: 1, side: THREE.DoubleSide })
    );
    cloth.rotation.x = -Math.PI / 2 + 0.15;
    cloth.position.y = 0.87;
    group.add(cloth);

    group.userData.hotspotLabel = 'Settling vessel — gravity filtered';
    group.userData.hotspotMesh = body;
    group.userData.oilMesh = oil;
    return group;
  }

  function buildBottle() {
    const group = new THREE.Group();
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.32, 0),
      new THREE.Vector2(0.34, 0.05),
      new THREE.Vector2(0.34, 0.55),
      new THREE.Vector2(0.3, 0.65),
      new THREE.Vector2(0.14, 0.78),
      new THREE.Vector2(0.13, 0.95),
      new THREE.Vector2(0.16, 0.97),
    ];
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xdff0df, transmission: 0.9, roughness: 0.08, ior: 1.5, transparent: true, opacity: 1 });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), glass);
    group.add(bottle);

    const oilProfile = profile.filter((p) => p.y <= 0.5).map((p) => new THREE.Vector2(p.x * 0.94, p.y));
    const oil = new THREE.Mesh(
      new THREE.LatheGeometry(oilProfile, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xd9a520, transmission: 0.5, roughness: 0.12, ior: 1.4 })
    );
    group.add(oil);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 })
    );
    cap.position.y = 1.0;
    group.add(cap);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.28),
      new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.9, transparent: true })
    );
    label.position.set(0, 0.42, 0.35);
    group.add(label);

    group.userData.hotspotLabel = 'Groove Organics bottle';
    group.userData.hotspotMesh = bottle;
    group.userData.oilMesh = oil;
    return group;
  }

  function buildSlab() {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.3, 3.2),
      new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.92, metalness: 0.02 })
    );
    slab.position.set(0.7, -0.15, 0);
    return slab;
  }

  function buildFoliage() {
    const mat = new THREE.MeshStandardMaterial({ map: leafTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
    const group = new THREE.Group();
    [
      [-5.4, 0.7, -0.9, 0.3],
      [-4.8, 1.0, 0.7, -0.4],
      [6.6, 0.8, -0.7, 0.5],
      [7.1, 1.1, 0.5, -0.2],
    ].forEach(([x, y, z, rot]) => {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), mat);
      leaf.position.set(x, y, z);
      leaf.rotation.set(0.1, rot, 0.15);
      group.add(leaf);
    });
    return group;
  }

  function buildOilStream(from, to, sag) {
    const mid = from.clone().lerp(to, 0.5);
    mid.y -= sag;
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const tex = flowTexture();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xe8b93a, transmission: 0.5, roughness: 0.2, ior: 1.4,
      transparent: true, opacity: 0.92, emissive: 0x3a2a05, emissiveIntensity: 0.25, map: tex,
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.028, 8, false), mat);
    mesh.userData.flowTex = tex;
    return mesh;
  }

  function buildGlow(color) {
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.9, 0.9, 1);
    return sprite;
  }

  function buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b2416);
    scene.fog = new THREE.FogExp2(0x1b2416, 0.05);

    const slab = buildSlab();
    scene.add(slab);
    scene.add(buildFoliage());

    const coconuts = buildCoconutCluster();
    coconuts.position.set(-3.4, -0.02, 0.3);
    scene.add(coconuts);

    const press = buildPressAssembly();
    press.position.set(0, -0.02, 0);
    scene.add(press);

    const vessel = buildVessel();
    vessel.position.set(2.6, -0.02, 0.1);
    scene.add(vessel);

    const bottle = buildBottle();
    bottle.position.set(4.9, -0.02, 0.15);
    bottle.scale.setScalar(1.15);
    scene.add(bottle);

    const outletWorld = press.position.clone().add(new THREE.Vector3(1.05, 0.13, 0));
    const vesselTopWorld = vessel.position.clone().add(new THREE.Vector3(0, 0.78, 0));
    const streamA = buildOilStream(outletWorld, vesselTopWorld, 0.5);
    scene.add(streamA);

    const vesselBaseWorld = vessel.position.clone().add(new THREE.Vector3(0.18, 0.15, -0.1));
    const bottleTopWorld = bottle.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    const streamB = buildOilStream(vesselBaseWorld, bottleTopWorld, 0.3);
    scene.add(streamB);

    const glowA = buildGlow(0xffd27a);
    glowA.position.copy(outletWorld).setY(outletWorld.y + 0.08);
    scene.add(glowA);
    const glowB = buildGlow(0xffd27a);
    glowB.scale.set(0.6, 0.6, 1);
    glowB.position.copy(bottleTopWorld);
    scene.add(glowB);

    const ambient = new THREE.AmbientLight(0xf1e9da, 0.42);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffe2ac, 1.3);
    key.position.set(4, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -4;
    scene.add(key);

    const rim = new THREE.PointLight(0x44573a, 0.5, 12);
    rim.position.set(-3, 3, -3);
    scene.add(rim);

    const oilGlowLight = new THREE.PointLight(0xc9a227, 0.7, 4);
    oilGlowLight.position.copy(outletWorld);
    scene.add(oilGlowLight);

    [slab, press, coconuts, vessel, bottle].forEach((obj) => {
      obj.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    });
    slab.castShadow = false;

    return { scene, press, coconuts, vessel, bottle, streamA, streamB, glowA, glowB, hotspots: [press, coconuts, vessel, bottle] };
  }

  // ---------------------------------------------------------------------
  // Camera keyframes — one per stage, plus a pulled-back closing reveal.
  // Positions line up with the object placements in buildScene() above.
  // ---------------------------------------------------------------------
  const CAMERA_KEYFRAMES = [
    { pos: new THREE.Vector3(-3.4, 1.3, 4.0), look: new THREE.Vector3(-3.4, 0.4, 0) },
    { pos: new THREE.Vector3(0.1, 1.7, 4.4), look: new THREE.Vector3(0, 1.0, 0) },
    { pos: new THREE.Vector3(2.5, 1.4, 3.6), look: new THREE.Vector3(2.6, 0.7, 0) },
    { pos: new THREE.Vector3(4.75, 1.4, 3.4), look: new THREE.Vector3(4.9, 0.9, 0) },
    { pos: new THREE.Vector3(0.8, 3.4, 10.5), look: new THREE.Vector3(0.8, 0.8, 0) },
  ];

  function smoothstep(t) {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }

  function computeProgress() {
    const rect = scroller.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, -rect.top / total));
  }

  // ---------------------------------------------------------------------
  // Hover highlight + tooltip on the four "hotspot" objects.
  // ---------------------------------------------------------------------
  function setupHover(camera, hotspots, tooltip) {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered = null;

    function clearHover() {
      if (!hovered) return;
      const mesh = hovered.userData.hotspotMesh;
      if (mesh && mesh.material) {
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = mesh.userData._baseEmissiveIntensity || 0;
      }
      hovered = null;
      tooltip.classList.remove('is-visible');
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const meshes = hotspots.map((h) => h.userData.hotspotMesh).filter(Boolean);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        const hitMesh = hits[0].object;
        const group = hotspots.find((h) => h.userData.hotspotMesh === hitMesh);
        if (group && group !== hovered) {
          clearHover();
          hovered = group;
          if (hitMesh.material) {
            hitMesh.material.emissive = new THREE.Color(0xc9a227);
            hitMesh.material.emissiveIntensity = 0.35;
          }
          tooltip.textContent = group.userData.hotspotLabel || '';
          tooltip.hidden = false;
          tooltip.classList.add('is-visible');
        }
        if (hovered) {
          tooltip.style.left = `${e.clientX - rect.left}px`;
          tooltip.style.top = `${e.clientY - rect.top}px`;
        }
      } else {
        clearHover();
      }
    }

    canvas.addEventListener('mousemove', onMove, { passive: true });
    canvas.addEventListener('mouseleave', clearHover, { passive: true });
  }

  // ---------------------------------------------------------------------
  // Wiring: lazy-init on intersection, RAF loop, perf watchdog, teardown.
  // ---------------------------------------------------------------------
  let sceneReady = false;
  let disabled = false;
  let rafId = null;
  let renderer = null;
  let camera = null;
  let built = null;
  let els = null;
  const basePos = new THREE.Vector3();
  const baseLook = new THREE.Vector3();
  const parallax = new THREE.Vector3();
  let mouseX = 0;
  let mouseY = 0;
  const clock = new THREE.Clock();

  function updateCameraForProgress(progress) {
    const segF = progress * (CAMERA_KEYFRAMES.length - 1);
    let idx = Math.floor(segF);
    if (idx > CAMERA_KEYFRAMES.length - 2) idx = CAMERA_KEYFRAMES.length - 2;
    if (idx < 0) idx = 0;
    const t = smoothstep(segF - idx);
    const a = CAMERA_KEYFRAMES[idx];
    const b = CAMERA_KEYFRAMES[idx + 1];
    basePos.lerpVectors(a.pos, b.pos, t);
    baseLook.lerpVectors(a.look, b.look, t);
  }

  function updateStageUI(progress) {
    const rounded = Math.round(progress * 4); // 0..4
    const showLockup = rounded >= 4;
    els.stages.forEach((el, i) => el.classList.toggle('is-active', !showLockup && i === rounded));
    els.lockup.classList.toggle('is-active', showLockup);
    els.dots.forEach((d, i) => d.classList.toggle('is-active', !showLockup && i === rounded));
  }

  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }

  function onResize() {
    if (!renderer || !camera) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function revertToFallback() {
    disabled = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    scroller.style.display = 'none';
    fallback.style.display = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    if (renderer) {
      try {
        renderer.dispose();
      } catch (err) {
        /* noop */
      }
    }
  }

  function ensureScene() {
    if (sceneReady || disabled) return;
    try {
      sceneReady = true;
      scroller.style.display = 'block';
      fallback.style.display = 'none';

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      renderer.setSize(width, height);

      camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
      built = buildScene();

      els = {
        stages: Array.from(document.querySelectorAll('#process3d-copy .process3d__stage')),
        lockup: document.getElementById('process3d-lockup'),
        dots: Array.from(document.querySelectorAll('#process3d-progress .process3d__progress-dot')),
        tooltip: document.getElementById('process3d-tooltip'),
      };

      setupHover(camera, built.hotspots, els.tooltip);
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('resize', onResize);
    } catch (err) {
      // WebGL context creation or scene build failed for some reason —
      // don't leave the visitor with a blank canvas, just show the plain
      // section instead.
      revertToFallback();
    }
  }

  // Perf watchdog: sample frame rate for the first ~2s after the loop
  // starts; if it's clearly struggling, drop back to the static fallback
  // rather than leave a stuttering scene running.
  let watchdogFrames = 0;
  let watchdogStart = null;
  let watchdogDone = false;
  function watchdogTick(now) {
    if (watchdogDone) return;
    if (watchdogStart === null) watchdogStart = now;
    watchdogFrames++;
    const elapsed = now - watchdogStart;
    if (elapsed > 2000) {
      watchdogDone = true;
      const fps = watchdogFrames / (elapsed / 1000);
      if (fps < 20) revertToFallback();
    }
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!renderer || !camera || !built) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    const progress = computeProgress();
    updateCameraForProgress(progress);
    parallax.x += (mouseX * 0.35 - parallax.x) * 0.04;
    parallax.y += (-mouseY * 0.2 - parallax.y) * 0.04;
    camera.position.set(basePos.x + parallax.x, basePos.y + parallax.y, basePos.z);
    camera.lookAt(baseLook);

    updateStageUI(progress);

    if (built.press.userData.mechanism) built.press.userData.mechanism.rotation.y += delta * 0.22;
    [built.streamA, built.streamB].forEach((s, i) => {
      if (s.userData.flowTex) s.userData.flowTex.offset.y -= delta * 0.5;
      const wob = 1 + Math.sin(elapsed * 3 + i) * 0.02;
      s.scale.set(wob, 1, wob);
    });
    if (built.vessel.userData.oilMesh) built.vessel.userData.oilMesh.scale.y = 1 + Math.sin(elapsed * 1.4) * 0.01;
    if (built.bottle.userData.oilMesh) built.bottle.userData.oilMesh.scale.y = 1 + Math.sin(elapsed * 1.4 + 1) * 0.01;
    built.glowA.material.opacity = 0.75 + Math.sin(elapsed * 2.2) * 0.15;
    built.glowB.material.opacity = 0.6 + Math.sin(elapsed * 1.8 + 1) * 0.15;

    renderer.render(built.scene, camera);
    watchdogTick(performance.now());
  }

  function startLoop() {
    if (rafId || disabled) return;
    clock.getDelta(); // discard the paused-time delta so nothing jumps
    animate();
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (disabled) return;
        if (entry.isIntersecting) {
          ensureScene();
          onResize();
          startLoop();
        } else {
          stopLoop();
        }
      });
    },
    { rootMargin: '800px 0px' }
  );
  observer.observe(section);
})();
