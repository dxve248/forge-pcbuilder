// Three.js viewport: renderer, camera, lighting, orbit controls, part
// management and click-to-select raycasting.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { OutlinePass } from '../vendor/postprocessing/OutlinePass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { LAYOUT, buildPart, disposeGroup } from './models.js';
import { getSettings, updateSettings } from './settings.js';

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

/** Whether the browser can create any WebGL context at all. */
export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/**
 * Drop-in stand-in for {@link Viewer} when WebGL is unavailable or fails to
 * initialise. It exposes the same surface the UI uses (so the 2D builder keeps
 * working) but renders nothing; 3D-only actions become no-ops.
 */
export class NullViewer {
  constructor(container, { message } = {}) {
    this.container = container;
    this.isFallback = true;
    this.parts = new Map();
    this.onSelect = () => {};
    this.onHover = null;
    this.renderer = { domElement: document.createElement('div') };
    this.renderer.domElement.className = 'gl-fallback-surface';
    container.appendChild(this.renderer.domElement);

    const note = document.createElement('div');
    note.className = 'gl-fallback-note';
    note.setAttribute('role', 'status');
    note.textContent = message || '3D preview unavailable on this device.';
    container.appendChild(note);
  }
  setPart() {}
  markBad() {}
  setSidePanel() {}
  setAutoRotate() {}
  setQuality() {}
  highlight() {}
  focusOn() {}
  resetView() {}
  resize() {}
  dispose() { this.container.replaceChildren(); }
  screenshot() { throw new Error('3D preview unavailable'); }
}

/**
 * Create the best viewer this device can support: a real {@link Viewer} when
 * WebGL works, otherwise a graceful {@link NullViewer}.
 * @param {HTMLElement} container
 * @param {{ onSelect?: Function, message?: string }} [opts]
 * @returns {Viewer|NullViewer}
 */
export function createViewer(container, opts = {}) {
  if (!isWebGLAvailable()) return new NullViewer(container, opts);
  try {
    return new Viewer(container, opts);
  } catch (err) {
    console.warn('WebGL init failed — falling back to 2D-only mode:', err);
    return new NullViewer(container, opts);
  }
}

/**
 * Three.js viewport for the build: owns the renderer, camera, lighting and
 * orbit controls, keeps a THREE.Group per installed category, and provides
 * click/hover picking with click-through side panels.
 *
 * Public API: setPart, markBad, setSidePanel, highlight, focusOn, resetView,
 * setAutoRotate, screenshot, setQuality, resize, dispose.
 */
export class Viewer {
  /**
   * @param {HTMLElement} container - element the canvas is appended to.
   * @param {{ onSelect?: (category: string|null) => void }} [opts]
   */
  constructor(container, { onSelect } = {}) {
    this.container = container;
    this.isFallback = false;
    this.onSelect = onSelect || (() => {});
    this.parts = new Map();       // category -> THREE.Group
    this.highlighted = null;
    this.clock = new THREE.Clock();
    this._spinners = new Set();   // fan blade groups animated in _tick
    this._bad = new Set();        // categories with compatibility errors
    this.onHover = null;          // fn({ category, partId, x, y } | null)

    // Selection outline only (glow/SSAO were removed for speed).
    // Overridable via URL (?outline=0) for low-end machines.
    const qs = new URLSearchParams(location.search);
    this._params = qs;
    this.quality = {
      outline: qs.get('outline') !== '0'
    };
    this._outlineWanted = this.quality.outline;

    // Camera focus animation state.
    this._camTween = null;

    this._initRenderer();
    this._autoTune();
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
    this._dprCap = Math.min(window.devicePixelRatio || 1, dprCap);
    this.renderer.setPixelRatio(this._dprCap);
    this.renderer.shadowMap.enabled = true;
    // The key light never moves, so its shadow map only needs re-drawing when
    // the build itself changes — not while the camera orbits / auto-rotates.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * Adaptive performance fallback: on software rasterizers (SwiftShader,
   * llvmpipe) or when forced with ?low=1, drop to pixel-ratio 1 and turn
   * the selection outline off. Explicit ?dpr= / ?outline= override this.
   */
  _autoTune() {
    const qs = this._params;
    const explicitOutline = qs.get('outline') !== null;
    const explicitDpr = qs.get('dpr') !== null;
    let low = qs.get('low') === '1';
    if (!low && !explicitOutline && !explicitDpr) {
      try {
        const gl = this.renderer.getContext();
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const name = info
          ? (gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '').toLowerCase()
          : '';
        low = /swiftshader|llvmpipe|software|basic renderer/i.test(name);
      } catch { /* keep tuned defaults */ }
    }
    if (low) {
      this.quality.outline = false;
      this.renderer.setPixelRatio(1);
    }
    // Lock adaptive resolution when the user pinned ?dpr= or forced ?low=1.
    this._dprLocked = explicitDpr || low;
    this._frameAcc = 0;
    this._frameN = 0;
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

      // Selection outline (only post effect kept — cheap vs. the old SSAO/bloom).
      if (this.quality.outline) {
        const outline = new OutlinePass(new THREE.Vector2(w, h), this.scene, this.camera, []);
        outline.edgeStrength = 4.0;
        outline.edgeGlow = 0.0;
        outline.edgeThickness = 1.6;
        outline.pulsePeriod = 0;
        outline.visibleEdgeColor.set('#7fe9ff');
        outline.hiddenEdgeColor.set('#20313f');
        // Start disabled — it's only enabled while a part is selected, so an
        // idle or simply orbiting viewer skips the whole outline pipeline.
        outline.enabled = false;
        this.outline = outline;
        this.composer.addPass(outline);
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
    // persist the final camera framing after an interaction settles
    controls.addEventListener('end', () => updateSettings({ view: this.getView() }));
    this.controls = controls;

    const saved = getSettings().view;
    if (saved && Array.isArray(saved.pos) && Array.isArray(saved.target)) {
      this.camera.position.set(...saved.pos);
      controls.target.set(...saved.target);
      controls.update();
    }
  }

  /** Current camera framing as a serialisable { pos, target } pair. */
  getView() {
    const { position: p } = this.camera;
    const { x, y, z } = this.controls.target;
    return { pos: [p.x, p.y, p.z], target: [x, y, z] };
  }

  _initPicking() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._lastHoverCat = null;
    this._lastHoverX = 0;
    this._lastHoverZ = 0;
    let downX = 0, downY = 0;

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
    el.addEventListener('pointerup', e => {
      // treat as a click only if the pointer barely moved (not a drag)
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      this._pick(e);
    });

    // hover affordance (throttled): pointer cursor + onHover hook for the
    // part-name tooltip in the UI.
    let hoverAt = 0;
    el.addEventListener('pointermove', e => {
      const now = performance.now();
      if (now - hoverAt < 60) return;
      hoverAt = now;
      this._hover(e);
    });
    el.addEventListener('pointerleave', () => this._setHover(null));
  }

  _raycastPoint(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.buildGroup.children, true);
  }

  _firstSelectable(hits) {
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        if (node.userData.sidePanel) break;
        if (node.userData.category) {
          return {
            category: node.userData.category,
            partId: node.userData.partId || null,
            x: hit.point.x, y: hit.point.y, z: hit.point.z
          };
        }
        node = node.parent;
      }
    }
    return null;
  }

  _hover(e) {
    const info = this._firstSelectable(this._raycastPoint(e));
    this._setHover(info);
  }

  _setHover(info) {
    const el = this.renderer.domElement;
    const cat = info ? info.category : null;
    el.style.cursor = cat ? 'pointer' : 'default';
    if (cat === this._lastHoverCat &&
        info && Math.abs(info.x - this._lastHoverX) + Math.abs(info.z - this._lastHoverZ) < 6) {
      return; // same part, near enough — avoid redundant DOM churn
    }
    this._lastHoverCat = cat;
    this._lastHoverX = info ? info.x : 0;
    this._lastHoverZ = info ? info.z : 0;
    if (this.onHover) this.onHover(info);
  }

  _pick(event) {
    const info = this._firstSelectable(this._raycastPoint(event));
    this.onSelect(info ? info.category : null);
  }

  // -- part management -----------------------------------------------------
  /**
   * Install (or clear) a part's 3D model for a category.
   * @param {string} category
   * @param {object|null} part - catalog part object, or null to remove it.
   */
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
    this._applySidePanel();
    this._rebuildSpinners();
    this.renderer.shadowMap.needsUpdate = true;
    this._dirty = true;
  }

  /** Collect fan blade groups from every installed part (spun in _tick). */
  _rebuildSpinners() {
    this._spinners.clear();
    for (const group of this.parts.values()) {
      group.traverse(o => { if (o.userData.spin) this._spinners.add(o); });
    }
  }

  /** Categories with compatibility errors get a red selection outline. */
  /**
   * Categories with unresolved compatibility errors get a red selection
   * outline instead of the normal highlight colour.
   * @param {string[]} [categories]
   */
  markBad(categories) {
    this._bad = new Set(categories || []);
    this._applyHighlight();
    this._dirty = true;
  }

  /** Show or hide the case's removable side panel. */
  /** Show or hide the two glass side panels as click-through overlays. */
  setSidePanel(on) {
    this._sidePanel = on;
    this._applySidePanel();
    this._dirty = true;
  }

  _applySidePanel() {
    const on = this._sidePanel !== false;
    const group = this.parts.get('case');
    if (group) group.traverse(o => { if (o.userData.sidePanel) o.visible = on; });
  }

  /** Select a category (cyan outline + glow) or clear the selection. */
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
      // Only run the outline pass while something is actually selected.
      this.outline.enabled = this._outlineWanted && !!group;
      const bad = this.highlighted && this._bad.has(this.highlighted);
      if (bad) {
        this.outline.visibleEdgeColor.set('#ff5470');
        this.outline.hiddenEdgeColor.set('#4a1620');
      } else {
        this.outline.visibleEdgeColor.set('#7fe9ff');
        this.outline.hiddenEdgeColor.set('#20313f');
      }
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

  /** Tween the camera back to the default framing of the whole case. */
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

  /** Enable or disable camera auto-rotation. */
  setAutoRotate(on) { this.controls.autoRotate = on; }

  /**
   * Render the current view to a PNG data URL at `scale`× the container
   * size (capped at 2560×1920). Rendering / pixel ratio is restored after.
   * @param {number} [scale=2] - resolution multiplier.
   */
  screenshot(scale = 2) {
    const w0 = this.container.clientWidth || 1;
    const h0 = this.container.clientHeight || 1;
    const w = Math.min(2560, Math.round(w0 * Math.max(1, scale)));
    const h = Math.min(1920, Math.round(h0 * Math.max(1, scale)));
    const prevPr = this.renderer.getPixelRatio();
    const prevAspect = this.camera.aspect;

    this.renderer.setPixelRatio(1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(1); this.composer.setSize(w, h); }
    this.controls.update();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');

    this.renderer.setPixelRatio(prevPr);
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w0, h0, false);
    if (this.composer) { this.composer.setPixelRatio(prevPr); this.composer.setSize(w0, h0); }
    this._dirty = true;
    return url;
  }

  /** Enable/disable the selection outline at runtime. */
  setQuality({ outline } = {}) {
    if (outline !== undefined) {
      this._outlineWanted = outline;
      if (this.outline) this.outline.enabled = outline && !!this.highlighted;
    }
    this._dirty = true;
  }

  /** Re-size the renderer to match its container (call on layout changes). */
  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      // EffectComposer caches the pixel ratio; keep it in step with the renderer.
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
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
        this.renderer.shadowMap.needsUpdate = true; // keep shadows in sync with the pop-in
        animating = true;
      }
    }

    // spinning fans (case + GPU + cooler) keep the loop alive while fitted;
    // rotation happens in each fan's local frame so orientation is handled.
    if (this._spinners.size) {
      const a = dt * 16;
      for (const s of this._spinners) s.rotation.z += a;
      animating = true;
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

    // Adaptive resolution: if frames stay slow for a sustained stretch, drop
    // to pixel ratio 1; restore the cap once they're comfortably fast again.
    if (!this._dprLocked && dt < 0.1) {
      this._frameAcc += dt;
      this._frameN++;
      if (this._frameN >= 45) {
        const avg = this._frameAcc / this._frameN;
        this._frameAcc = 0;
        this._frameN = 0;
        const pr = this.renderer.getPixelRatio();
        if (avg > 0.024 && pr > 1) {
          this.renderer.setPixelRatio(1);
          this.resize();
        } else if (avg < 0.014 && pr < this._dprCap) {
          this.renderer.setPixelRatio(this._dprCap);
          this.resize();
        }
      }
    }

    // Skip the EffectComposer (an extra render target + full-screen output
    // pass) whenever no post effect is active — e.g. nothing is selected.
    const postActive = this.outline ? this.outline.enabled : false;
    if (this.composer && postActive) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
