// Three.js viewport: renderer, camera, lighting, orbit controls, part
// management and click-to-select raycasting.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { SSAOPass } from '../vendor/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from '../vendor/postprocessing/OutlinePass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { LAYOUT, buildPart, disposeGroup } from './models.js';

// Default view framing (also used by Reset View).
const HOME_POS = new THREE.Vector3(62, 40, 78);
const HOME_TARGET = new THREE.Vector3(0, LAYOUT.H * 0.52, 0);

// Studio-style equirectangular backdrop: dark navy with magenta/cyan glows
// that tie into the rim lights.
function makeBackdropTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#06080f');
  base.addColorStop(0.46, '#0d1424');
  base.addColorStop(0.52, '#12203a');
  base.addColorStop(1, '#04060b');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
  };
  glow(280, 250, 260, 'rgba(122,60,255,0.40)');
  glow(760, 270, 280, 'rgba(0,213,255,0.34)');
  glow(520, 120, 220, 'rgba(80,120,255,0.14)');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export class Viewer {
  constructor(container, { onSelect } = {}) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.parts = new Map();       // category -> THREE.Group
    this.highlighted = null;
    this.clock = new THREE.Clock();

    // Quality tiers, overridable via URL (e.g. ?ao=0&bloom=0) for tuning
    // and low-end machines.
    const qs = new URLSearchParams(location.search);
    this._params = qs;
    this.quality = {
      ao: qs.get('ao') !== '0',
      bloom: qs.get('bloom') !== '0',
      outline: qs.get('outline') !== '0'
    };

    // Camera focus animation state.
    this._camTween = null;

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initGround();
    this._initControls();
    this._initPicking();
    this._initComposer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    // Render-on-demand: frames are drawn only while something is actually
    // changing (orbit/damping, auto-rotate, a focus tween or a part spawning),
    // so an idle viewer costs almost nothing. `_dirty` is set by controls,
    // resize and any state change below.
    this._dirty = true;
    this._loop = () => this._tick();
    this._onVisibility = () => {
      if (document.hidden) {
        this.renderer.setAnimationLoop(null);
      } else {
        this.clock.getDelta(); // drop the paused interval
        this._dirty = true;
        this.renderer.setAnimationLoop(this._loop);
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    this.resize();
    this.renderer.setAnimationLoop(this._loop);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    // Cap the device pixel ratio (big win on HiDPI screens). Override with
    // ?dpr=1 for low-end machines.
    const dprOverride = parseFloat(this._params.get('dpr'));
    const dprCap = Number.isFinite(dprOverride) ? dprOverride : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = makeBackdropTexture();
    this.scene.fog = new THREE.Fog(0x0a0c11, 140, 260);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    this.camera.position.set(62, 40, 78);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.buildGroup = new THREE.Group();
    this.scene.add(this.buildGroup);
  }

  _initLights() {
    this.scene.add(new THREE.HemisphereLight(0xc2d6ff, 0x0a0c11, 0.62));

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(40, 70, 50);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 260;
    const s = 70;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 3;
    this.scene.add(key);

    const rimPurple = new THREE.PointLight(0x8a4cff, 520, 220, 2);
    rimPurple.position.set(-42, 34, -50);
    this.scene.add(rimPurple);

    const rimCyan = new THREE.PointLight(0x00d5ff, 480, 220, 2);
    rimCyan.position.set(50, 20, 34);
    this.scene.add(rimCyan);

    const kicker = new THREE.PointLight(0xff5a7a, 220, 160, 2);
    kicker.position.set(-20, 60, 55);
    this.scene.add(kicker);

    const fill = new THREE.DirectionalLight(0x9fb6ff, 0.6);
    fill.position.set(-40, 20, -30);
    this.scene.add(fill);
  }

  _initGround() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0d15, metalness: 0.75, roughness: 0.28 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 64), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(190, 60, 0x23324a, 0x141a24);
    grid.position.y = -0.45;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    this.scene.add(grid);
  }

  _initComposer() {
    try {
      const w = this.container.clientWidth || 1;
      const h = this.container.clientHeight || 1;
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      // Ambient occlusion grounds the parts inside the case.
      if (this.quality.ao) {
        const qs = this._params;
        const num = (key, def) => {
          const v = parseFloat(qs.get(key));
          return Number.isFinite(v) ? v : def;
        };
        const ssao = new SSAOPass(this.scene, this.camera, w, h);
        ssao.kernelRadius = num('aorad', 5.0);   // world units
        ssao.minDistance = num('aomin', 0.0007);
        ssao.maxDistance = num('aomax', 0.018);
        ssao.output = SSAOPass.OUTPUT.Default;
        const strength = num('aostr', 1.0);
        if (ssao.blurMaterial) ssao.blurMaterial.uniforms.aoStrength.value = strength;
        this.ssao = ssao;
        this.composer.addPass(ssao);
      }

      // Selection outline.
      if (this.quality.outline) {
        const outline = new OutlinePass(new THREE.Vector2(w, h), this.scene, this.camera, []);
        outline.edgeStrength = 4.0;
        outline.edgeGlow = 0.0;
        outline.edgeThickness = 1.6;
        outline.pulsePeriod = 0;
        outline.visibleEdgeColor.set('#7fe9ff');
        outline.hiddenEdgeColor.set('#20313f');
        this.outline = outline;
        this.composer.addPass(outline);
      }

      if (this.quality.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.72, 0.62, 0.72);
        this.composer.addPass(this.bloom);
      }

      this.composer.addPass(new OutputPass());
    } catch (err) {
      console.warn('post-processing unavailable, falling back to direct render:', err);
      this.composer = null;
    }
  }

  _initControls() {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, LAYOUT.H * 0.52, 0);
    controls.minDistance = 30;
    controls.maxDistance = 190;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
    // any manual interaction cancels a running focus animation
    controls.addEventListener('start', () => { this._camTween = null; });
    // moving the camera (drag, damping, auto-rotate) schedules a redraw
    controls.addEventListener('change', () => { this._dirty = true; });
    this.controls = controls;
  }

  _initPicking() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let downX = 0, downY = 0;

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
    el.addEventListener('pointerup', e => {
      // treat as a click only if the pointer barely moved (not a drag)
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      this._pick(e);
    });
  }

  _pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.buildGroup.children, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData.category) node = node.parent;
      if (node) { this.onSelect(node.userData.category); return; }
    }
    this.onSelect(null);
  }

  // -- part management -----------------------------------------------------
  setPart(category, part) {
    const existing = this.parts.get(category);
    if (existing) {
      this.buildGroup.remove(existing);
      disposeGroup(existing);
      this.parts.delete(category);
    }
    if (part) {
      const group = buildPart(category, part);
      if (group) {
        group.userData.partId = part.id;

        // small pop-in animation
        group.scale.setScalar(0.001);
        group.userData.spawn = 0;
        this.parts.set(category, group);
        this.buildGroup.add(group);
      }
    }
    // normalise glow across the whole build (materials are shared between
    // clones, so a part may arrive already carrying a stale highlight)
    this._applyHighlight();
    this._dirty = true;
  }

  highlight(category) {
    if (this.highlighted === category) return;
    this.highlighted = category;
    this._applyHighlight();
    this._dirty = true;
  }

  /** Push the current highlight to the outline pass and every installed part. */
  _applyHighlight() {
    if (this.outline) {
      const group = this.highlighted ? this.parts.get(this.highlighted) : null;
      this.outline.selectedObjects = group ? [group] : [];
    }
    for (const [cat, group] of this.parts) {
      const on = cat === this.highlighted;
      group.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!('emissiveIntensity' in m)) continue;
          // remember each material's original glow the first time we touch it
          if (m.userData._baseEmissive === undefined) {
            m.userData._baseEmissive = m.emissiveIntensity ?? 1;
          }
          m.emissiveIntensity = on
            ? m.userData._baseEmissive + 0.9
            : m.userData._baseEmissive;
        }
      });
    }
  }

  /** Smoothly frame a category's part (or the whole build when null). */
  focusOn(category) {
    const box = new THREE.Box3();
    const group = category ? this.parts.get(category) : null;
    if (group) {
      // measure at full size — the group may be mid pop-in (scaled ~0)
      const s = group.scale.clone();
      group.scale.set(1, 1, 1);
      group.updateMatrixWorld(true);
      box.setFromObject(group);
      group.scale.copy(s);
      group.updateMatrixWorld(true);
    } else {
      box.setFromObject(this.buildGroup);
    }
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 8);

    // keep the current viewing direction but pull in to a comfortable distance
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = Math.min(190, Math.max(30, radius / Math.tan((this.camera.fov * Math.PI / 180) / 2) * 1.7));
    const desiredPos = center.clone().add(dir.multiplyScalar(dist));
    desiredPos.y = Math.max(desiredPos.y, center.y + 2);

    this._camTween = {
      t: 0,
      fromPos: this.camera.position.clone(),
      toPos: desiredPos,
      fromTarget: this.controls.target.clone(),
      toTarget: center
    };
    this._pauseRotate();
  }

  resetView() {
    this._camTween = {
      t: 0,
      fromPos: this.camera.position.clone(),
      toPos: HOME_POS.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: HOME_TARGET.clone()
    };
    this._pauseRotate();
  }

  _pauseRotate() {
    if (this.controls.autoRotate) {
      this._resumeRotate = true;
      this.controls.autoRotate = false;
    }
  }

  setAutoRotate(on) { this.controls.autoRotate = on; }

  /** Toggle post-processing effects at runtime. */
  setQuality({ ao, bloom, outline } = {}) {
    if (ao !== undefined && this.ssao) this.ssao.enabled = ao;
    if (bloom !== undefined && this.bloom) this.bloom.enabled = bloom;
    if (outline !== undefined && this.outline) this.outline.enabled = outline;
    this._dirty = true;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._dirty = true;
  }

  /** Release GPU resources and listeners. */
  dispose() {
    this.renderer.setAnimationLoop(null);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const group of this.parts.values()) disposeGroup(group);
    this.parts.clear();
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
  }

  _tick() {
    const dt = this.clock.getDelta();
    let animating = false;

    // ease spawned parts up to full scale
    for (const group of this.parts.values()) {
      if (group.userData.spawn !== undefined && group.userData.spawn < 1) {
        group.userData.spawn = Math.min(1, group.userData.spawn + dt * 4);
        const t = group.userData.spawn;
        const eased = 1 - Math.pow(1 - t, 3);
        group.scale.setScalar(Math.max(0.001, eased));
        animating = true;
      }
    }

    // camera focus animation (ease-in-out); user interaction cancels it
    if (this._camTween) {
      const tw = this._camTween;
      tw.t = Math.min(1, tw.t + dt * 2.2);
      const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      animating = true;
      if (tw.t >= 1) {
        this._camTween = null;
        if (this._resumeRotate) { this.controls.autoRotate = true; this._resumeRotate = false; }
      }
    }

    this.controls.update(); // may set this._dirty via the 'change' event

    // draw only when something moved or changed
    if (!this._dirty && !animating) return;
    this._dirty = false;

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
