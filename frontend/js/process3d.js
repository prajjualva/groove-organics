// "The Journey of the Oil" — a scroll-driven Three.js miniature diorama:
// coconuts -> traditional wooden chekku press -> glass settling vessel ->
// Groove Organics bottle, laid out left-to-right. The camera dollies along
// this small scene as the visitor scrolls through a tall pinned section,
// with a little cursor parallax on top.
//
// This is a stylized, atmospheric interpretation — not an attempt at
// photorealism (no external 3D model files, no lighting bake, nothing to
// fetch or fail to load — this app has no build step and nothing to
// bundle). Within that constraint this file leans as far as primitive
// geometry + canvas-generated textures reasonably can toward "handcrafted
// object, not a CGI primitive": jittered/irregular geometry instead of
// perfect spheres, a tapered volumetric oil stream instead of a uniform
// tube, and the site's real logo composited onto the bottle label.
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
  // Small procedural texture helpers — no image files needed (except the
  // bottle label, which composites the site's own real logo — see
  // buildLabelTexture below).
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

  // Nudges every vertex of an origin-centered geometry slightly inward or
  // outward along its own radial direction, at random. Turns a perfect
  // primitive (sphere, cylinder) into something that reads as hand-shaped
  // rather than a flawless CGI solid. Small amounts only — this is meant
  // to read as "handmade", not "damaged".
  function jitterGeometry(geo, amount, seedFn) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      const rnd = seedFn ? seedFn(i) : Math.random();
      const d = (rnd - 0.5) * amount;
      pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
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

  // Vertical-plank "barrel stave" texture for the round press drum — reads
  // as a coopered wooden vessel instead of a smooth lathed cylinder.
  function barrelTexture() {
    return canvasTexture((ctx, s) => {
      const planks = 16;
      const w = s / planks;
      for (let i = 0; i < planks; i++) {
        const tone = 92 + Math.floor(Math.random() * 22); // 92-114
        ctx.fillStyle = `rgb(${tone},${Math.round(tone * 0.62)},${Math.round(tone * 0.34)})`;
        ctx.fillRect(i * w, 0, w, s);
        // seam shadow/highlight on each plank edge
        const seam = ctx.createLinearGradient(i * w, 0, i * w + w, 0);
        seam.addColorStop(0, 'rgba(0,0,0,0.28)');
        seam.addColorStop(0.15, 'rgba(0,0,0,0)');
        seam.addColorStop(0.85, 'rgba(255,255,255,0.05)');
        seam.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = seam;
        ctx.fillRect(i * w, 0, w, s);
        // a couple of faint horizontal grain flecks per plank
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.7;
        for (let k = 0; k < 3; k++) {
          const y = Math.random() * s;
          ctx.beginPath();
          ctx.moveTo(i * w + w * 0.1, y);
          ctx.lineTo(i * w + w * 0.9, y + (Math.random() - 0.5) * 6);
          ctx.stroke();
        }
      }
    }, 512);
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

  // Coarse husk-fiber texture for the coconuts — directional streaks
  // instead of a flat brown so they read as fibrous, not rubbery.
  function huskTexture() {
    return canvasTexture((ctx, s) => {
      ctx.fillStyle = '#5a4530';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(30,20,10,0.35)';
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const len = 4 + Math.random() * 10;
        const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        ctx.lineWidth = 0.6 + Math.random() * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
    }, 128);
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

  // Simple over-under weave pattern for the harvest basket.
  function basketTexture() {
    return canvasTexture((ctx, s) => {
      ctx.fillStyle = '#8a6a3d';
      ctx.fillRect(0, 0, s, s);
      const cell = 14;
      for (let y = 0; y < s; y += cell) {
        for (let x = 0; x < s; x += cell) {
          const alt = ((x / cell) + (y / cell)) % 2 === 0;
          ctx.fillStyle = alt ? 'rgba(60,40,15,0.28)' : 'rgba(255,220,170,0.12)';
          ctx.fillRect(x, y, cell - 1.5, cell - 1.5);
        }
      }
    }, 256);
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

  // Bottle label: draws the plain wordmark immediately (so the bottle is
  // never blank), then swaps in the site's actual logo (frontend/assets/
  // logo.png — already loaded elsewhere on the page, so this is normally
  // instant from cache) once it loads. Same-origin static asset, not an
  // external dependency.
  function buildLabelTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    function draw(logoImg) {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#fbf6ec';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(27,36,22,0.25)';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, size - 12, size - 12);
      let textY = size * 0.46;
      if (logoImg) {
        const logoSize = size * 0.3;
        ctx.drawImage(logoImg, size / 2 - logoSize / 2, size * 0.12, logoSize, logoSize);
        textY = size * 0.58;
      }
      ctx.fillStyle = '#1b2416';
      ctx.textAlign = 'center';
      ctx.font = '600 22px Georgia, serif';
      ctx.fillText('GROOVE', size / 2, textY);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#556b45';
      ctx.fillText('ORGANICS', size / 2, textY + 16);
      ctx.font = '7px monospace';
      ctx.fillStyle = '#8a7a5a';
      ctx.fillText('COLD-PRESSED COCONUT OIL', size / 2, textY + 30);
    }

    draw(null);
    const texture = new THREE.CanvasTexture(c);
    const img = new Image();
    img.onload = () => {
      draw(img);
      texture.needsUpdate = true;
    };
    img.src = '/assets/logo.png';
    return texture;
  }

  // ---------------------------------------------------------------------
  // A hand-built variable-radius tube: THREE.TubeGeometry only supports a
  // constant radius, but the oil needs to look like it's actually pouring
  // — thicker where it leaves the press, narrowing as it falls, with a
  // touch of organic ripple rather than a perfectly uniform pipe.
  // ---------------------------------------------------------------------
  function buildTaperedTubeGeometry(curve, radiusStart, radiusEnd, tubularSegments, radialSegments) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const frames = curve.computeFrenetFrames(tubularSegments, false);
    const points = curve.getSpacedPoints(tubularSegments);

    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      const radius = THREE.MathUtils.lerp(radiusStart, radiusEnd, t) * (1 + Math.sin(t * 13) * 0.05);
      const normal = frames.normals[i];
      const binormal = frames.binormals[i];
      const p = points[i];
      for (let j = 0; j <= radialSegments; j++) {
        const v = (j / radialSegments) * Math.PI * 2;
        const sin = Math.sin(v);
        const cos = -Math.cos(v);
        const nx = cos * normal.x + sin * binormal.x;
        const ny = cos * normal.y + sin * binormal.y;
        const nz = cos * normal.z + sin * binormal.z;
        positions.push(p.x + radius * nx, p.y + radius * ny, p.z + radius * nz);
        normals.push(nx, ny, nz);
        uvs.push(t, j / radialSegments);
      }
    }
    for (let i = 1; i <= tubularSegments; i++) {
      for (let j = 1; j <= radialSegments; j++) {
        const a = (radialSegments + 1) * (i - 1) + (j - 1);
        const b = (radialSegments + 1) * i + (j - 1);
        const c = (radialSegments + 1) * i + j;
        const d = (radialSegments + 1) * (i - 1) + j;
        indices.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geo;
  }

  function buildOilStream(from, to, sag, radiusStart, radiusEnd) {
    const mid = from.clone().lerp(to, 0.5);
    mid.y -= sag;
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const tex = flowTexture();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xefc44a, transmission: 0.42, roughness: 0.14, ior: 1.42,
      transparent: true, opacity: 0.96, emissive: 0x8a5a08, emissiveIntensity: 0.45, map: tex,
    });
    const mesh = new THREE.Mesh(buildTaperedTubeGeometry(curve, radiusStart, radiusEnd, 28, 10), mat);
    mesh.userData.flowTex = tex;

    // A slim bright highlight running alongside the main stream — cheap
    // stand-in for a specular reflection, reads as "wet".
    const highlightCurve = new THREE.CatmullRomCurve3([
      from.clone().add(new THREE.Vector3(radiusStart * 0.4, 0, 0)),
      mid.clone().add(new THREE.Vector3(radiusStart * 0.2, 0, 0)),
      to.clone().add(new THREE.Vector3(radiusEnd * 0.3, 0, 0)),
    ]);
    const highlight = new THREE.Mesh(
      new THREE.TubeGeometry(highlightCurve, 20, Math.max(radiusStart, radiusEnd) * 0.22, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.5 })
    );

    // A few small droplets that loop down the first third of the stream,
    // staggered, for a sense of continuous pouring rather than a static
    // solid rod of oil.
    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xefc44a, transmission: 0.3, roughness: 0.1, emissive: 0x8a5a08, emissiveIntensity: 0.4 });
    const droplets = [0, 0.33, 0.66].map((phase) => {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(radiusStart * 0.9, 8, 8), dropMat);
      drop.userData.phase = phase;
      return drop;
    });

    return { mesh, highlight, droplets, curve };
  }

  // ---------------------------------------------------------------------
  // Scene object builders — a small "diorama" laid out along local X.
  // ---------------------------------------------------------------------
  function buildPressAssembly() {
    const group = new THREE.Group();
    const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.88, metalness: 0.04 });
    const woodMid = new THREE.MeshStandardMaterial({ map: woodTexture('#7a5230', '#4a331d'), roughness: 0.8, metalness: 0.05 });
    const woodDark = new THREE.MeshStandardMaterial({ map: woodTexture('#4a3018', '#2a1a0c'), roughness: 0.85, metalness: 0.05 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.4, metalness: 0.75 });

    // Stone quern base the drum sits on — a traditional chekku is set into
    // a fixed stone/earth foundation, not just resting on a tabletop.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.36, 1.5, 0.22, 24),
      new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9 })
    );
    base.position.y = 0.02;
    group.add(base);

    const drumGeo = jitterGeometry(new THREE.CylinderGeometry(1.15, 1.3, 1.05, 24, 3), 0.015);
    const drum = new THREE.Mesh(drumGeo, barrelMat);
    drum.position.y = 0.63;
    group.add(drum);

    // Three iron bands, slightly irregular radii/heights — hand-fitted,
    // not machine-uniform.
    [1.08, 0.66, 0.24].forEach((y, i) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.17 + (i % 2) * 0.01, 0.045, 8, 28), metal);
      band.rotation.x = Math.PI / 2;
      band.position.y = y + 0.08;
      group.add(band);
    });

    // Rotating mechanism: center pole + a single asymmetric lever arm
    // (longer on one side, a short stub on the other for visual balance)
    // — reads as "the arm a person pushes to turn the wheel", not a
    // symmetric crossbar/plus-sign.
    const mech = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.0, 12), woodMid);
    pole.position.y = 1.48;
    mech.add(pole);

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 10), woodMid);
    beam.rotation.z = Math.PI / 2 - 0.08;
    beam.position.set(0.55, 2.18, 0);
    mech.add(beam);

    // Rope-wrap detail near the handle end — a few thin dark torus rings.
    for (let i = 0; i < 4; i++) {
      const wrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.015, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 0.9 })
      );
      wrap.rotation.y = Math.PI / 2;
      wrap.position.set(1.15 + i * 0.06, 2.1, 0);
      mech.add(wrap);
    }
    const beamCap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), metal);
    beamCap.position.set(1.47, 2.1, 0);
    mech.add(beamCap);
    group.add(mech);

    const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.36), woodDark);
    outlet.position.set(1.05, 0.22, 0);
    group.add(outlet);

    group.userData.mechanism = mech;
    group.userData.hotspotLabel = 'Traditional chekku press';
    group.userData.hotspotMesh = drum;
    return group;
  }

  function buildCoconutCluster() {
    const group = new THREE.Group();
    const husk = new THREE.MeshStandardMaterial({ map: huskTexture(), roughness: 0.95 });
    const flesh = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.85 });
    const shellRim = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.8 });

    // A shallow woven basket under the pile — context and craft detail,
    // matching how coconuts actually arrive at a press.
    const basket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.5, 0.28, 20, 1, true),
      new THREE.MeshStandardMaterial({ map: basketTexture(), roughness: 0.95, side: THREE.DoubleSide })
    );
    basket.position.y = 0.14;
    group.add(basket);
    const basketFloor = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshStandardMaterial({ map: basketTexture(), roughness: 0.95 })
    );
    basketFloor.rotation.x = -Math.PI / 2;
    basketFloor.position.y = 0.02;
    group.add(basketFloor);

    const wholePositions = [
      [-0.24, 0.42, 0.08],
      [0.22, 0.4, -0.12],
      [0.36, 0.42, 0.2],
    ];
    wholePositions.forEach((p) => {
      const geo = jitterGeometry(new THREE.IcosahedronGeometry(0.24, 2), 0.035);
      const mesh = new THREE.Mesh(geo, husk);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.scale.y = 0.94;
      mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.3);
      group.add(mesh);
    });

    // One halved coconut, clearly showing white flesh + a shell rim, so the
    // pile reads unmistakably as coconuts and not generic brown balls.
    const halfBase = new THREE.Group();
    const outerGeo = jitterGeometry(new THREE.SphereGeometry(0.24, 16, 12, 0, Math.PI), 0.02);
    const outer = new THREE.Mesh(outerGeo, husk);
    halfBase.add(outer);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 12, 0, Math.PI), flesh);
    inner.scale.set(0.97, 0.97, 0.97);
    halfBase.add(inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.02, 8, 24, Math.PI), shellRim);
    rim.rotation.x = Math.PI / 2;
    halfBase.add(rim);
    halfBase.position.set(-0.04, 0.42, -0.22);
    halfBase.rotation.y = Math.PI / 3;
    group.add(halfBase);

    group.userData.hotspotLabel = 'Coconut, hand-picked';
    group.userData.hotspotMesh = outer;
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
    // A rounder shoulder and a slightly longer neck than a generic
    // cylinder — closer to an actual small-batch oil bottle silhouette.
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.3, 0),
      new THREE.Vector2(0.33, 0.06),
      new THREE.Vector2(0.33, 0.48),
      new THREE.Vector2(0.29, 0.62),
      new THREE.Vector2(0.2, 0.72),
      new THREE.Vector2(0.13, 0.8),
      new THREE.Vector2(0.125, 1.0),
      new THREE.Vector2(0.155, 1.02),
    ];
    // Amber/brown-tinted glass — real cold-pressed oil is commonly bottled
    // in amber glass to protect it from light; also just reads more
    // "premium apothecary" than clear glass.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x8a5a22, transmission: 0.72, roughness: 0.06, ior: 1.5, transparent: true, opacity: 1,
    });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glass);
    group.add(bottle);

    // A slightly larger, very faint outer shell with additive blending —
    // a cheap stand-in for a fresnel rim-light on the glass without a
    // real environment map.
    const rimShell = new THREE.Mesh(
      new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p.x * 1.05, p.y)), 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.08, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(rimShell);

    const oilProfile = profile.filter((p) => p.y <= 0.44).map((p) => new THREE.Vector2(p.x * 0.92, p.y));
    const oil = new THREE.Mesh(
      new THREE.LatheGeometry(oilProfile, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xd9a520, transmission: 0.5, roughness: 0.1, ior: 1.4 })
    );
    group.add(oil);

    // Domed premium cap with a couple of ridge lines.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.16, 0.1, 18),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.75 })
    );
    cap.position.y = 1.05;
    group.add(cap);
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd4b23a, roughness: 0.28, metalness: 0.75 })
    );
    capDome.position.y = 1.1;
    group.add(capDome);
    for (let i = 0; i < 2; i++) {
      const ridge = new THREE.Mesh(
        new THREE.TorusGeometry(0.157, 0.006, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0x8a6a1a, roughness: 0.4, metalness: 0.6 })
      );
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = 1.02 + i * 0.04;
      group.add(ridge);
    }

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.32),
      new THREE.MeshStandardMaterial({ map: buildLabelTexture(), roughness: 0.9, transparent: true })
    );
    label.position.set(0, 0.38, 0.335);
    group.add(label);

    group.userData.hotspotLabel = 'Groove Organics — Cold-Pressed Coconut Oil';
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

    const outletWorld = press.position.clone().add(new THREE.Vector3(1.05, 0.21, 0));
    const vesselTopWorld = vessel.position.clone().add(new THREE.Vector3(0, 0.78, 0));
    const streamA = buildOilStream(outletWorld, vesselTopWorld, 0.5, 0.075, 0.045);
    scene.add(streamA.mesh, streamA.highlight);
    streamA.droplets.forEach((d) => scene.add(d));

    const vesselBaseWorld = vessel.position.clone().add(new THREE.Vector3(0.18, 0.15, -0.1));
    const bottleTopWorld = bottle.position.clone().add(new THREE.Vector3(0, 1.02, 0));
    const streamB = buildOilStream(vesselBaseWorld, bottleTopWorld, 0.3, 0.05, 0.032);
    scene.add(streamB.mesh, streamB.highlight);
    streamB.droplets.forEach((d) => scene.add(d));

    const glowA = buildGlow(0xffd27a);
    glowA.position.copy(outletWorld).setY(outletWorld.y + 0.08);
    scene.add(glowA);
    const glowB = buildGlow(0xffd27a);
    glowB.scale.set(0.6, 0.6, 1);
    glowB.position.copy(bottleTopWorld);
    scene.add(glowB);

    const ambient = new THREE.AmbientLight(0xf1e9da, 0.42);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffe2ac, 1.35);
    key.position.set(4, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -4;
    scene.add(key);

    // A soft secondary warm light from the other side so shadows aren't a
    // single flat direction — helps the barrel staves and coconut jitter
    // actually read as texture rather than disappearing into shadow.
    const fill = new THREE.DirectionalLight(0xd9c9a0, 0.4);
    fill.position.set(-5, 3, 2);
    scene.add(fill);

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

    return {
      scene, press, coconuts, vessel, bottle, streamA, streamB, glowA, glowB,
      hotspots: [press, coconuts, vessel, bottle],
    };
  }

  // ---------------------------------------------------------------------
  // Camera keyframes — one per stage, plus a pulled-back closing reveal.
  // The lockup framing (kf4) is shifted right of scene-center so the left
  // side of the frame is comparatively open — that's where the closing
  // text sits, instead of directly over the press.
  // ---------------------------------------------------------------------
  const CAMERA_KEYFRAMES = [
    { pos: new THREE.Vector3(-3.4, 1.3, 4.0), look: new THREE.Vector3(-3.4, 0.4, 0) },
    { pos: new THREE.Vector3(0.1, 1.7, 4.4), look: new THREE.Vector3(0, 1.0, 0) },
    { pos: new THREE.Vector3(2.5, 1.4, 3.6), look: new THREE.Vector3(2.6, 0.7, 0) },
    { pos: new THREE.Vector3(4.75, 1.4, 3.4), look: new THREE.Vector3(4.9, 0.9, 0) },
    { pos: new THREE.Vector3(2.6, 3.2, 10.5), look: new THREE.Vector3(2.6, 0.8, 0) },
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
        mesh.material.emissiveIntensity = 0;
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
          if (hitMesh.material && 'emissive' in hitMesh.material) {
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

  function animateDroplets(stream, elapsed, speed) {
    stream.droplets.forEach((drop) => {
      const t = ((elapsed * speed + drop.userData.phase) % 1);
      // Only travel the first ~40% of the curve, near the outlet, then
      // "reset" (fade near t=0.4..1 by shrinking) — keeps them reading as
      // drips leaving the source rather than balls riding the whole pipe.
      const travel = Math.min(t / 0.4, 1);
      const pt = stream.curve.getPointAt(Math.min(travel, 0.999));
      drop.position.copy(pt);
      const scale = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.15);
      drop.scale.setScalar(scale);
    });
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
      if (s.mesh.userData.flowTex) s.mesh.userData.flowTex.offset.y -= delta * 0.5;
      const wob = 1 + Math.sin(elapsed * 3 + i) * 0.015;
      s.mesh.scale.set(wob, 1, wob);
      animateDroplets(s, elapsed, 0.7 + i * 0.15);
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
