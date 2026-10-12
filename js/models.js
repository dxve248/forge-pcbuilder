// Procedural, product-accurate Three.js geometry for every PC component.
//
// Modelled in centimetres with the case interior centred on the origin and
// the open (glass) side facing +X. Each builder returns a THREE.Group tagged
// with userData so the scene can select/dispose it.

import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// Layout constants (cm)
// ---------------------------------------------------------------------------
export const LAYOUT = {
  W: 21,
  H: 46,
  D: 45,
  trayX: -9.2,
  boardFace: -9.0,
  boardY: 11,
  boardZ: -20.5,
  frontZ: 20.5,
  gpuSlotY: 13
};

const BOARD_SIZE = {
  'ATX': { y: 24.4, z: 30.5 },
  'Micro-ATX': { y: 24.4, z: 24.4 },
  'Mini-ITX': { y: 17.0, z: 17.0 }
};

const mm = v => v / 10;
const hex = c => '#' + c.toString(16).padStart(6, '0');
const rnd = (a, b) => a + Math.random() * (b - a);

// Brand palette -------------------------------------------------------------
const BRAND = {
  nvidia: { accent: 0x76b900, dark: 0x1a1c1f },
  amd: { accent: 0xed1c24, dark: 0x1a1c1f },
  asus: { accent: 0xff2d55, dark: 0x0c0f13 },
  msi: { accent: 0xff2a2a, dark: 0x111418 },
  gigabyte: { accent: 0xff8a00, dark: 0x0f1319 },
  asrock: { accent: 0xed1c24, dark: 0x101419 },
  noctua: { fan: 0xbb9863, fanDark: 0x5a4326, fins: 0xb9c1cb },
  deepcool: { fan: 0x101216, fanDark: 0x2a2f36, fins: 0x2a2f36, top: 0xe8ecf1 },
  coolermaster: { fan: 0x101216, fanDark: 0x2a2f36, fins: 0xb9c1cb },
  bequiet: { fan: 0x0d0f12, fanDark: 0x24272c, fins: 0x191c20 },
  nzxt: { accent: 0x4a7dff },
  corsair: { accent: 0xffd166 },
  arctic: { accent: 0x00a3e0 }
};

// ---------------------------------------------------------------------------
// Canvas texture helpers
// ---------------------------------------------------------------------------
const texCache = new Map();

function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

function brushedTex(color) {
  return canvasTex('brush' + color, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = hex(color); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const y = Math.random() * h;
      ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
      ctx.beginPath(); ctx.moveTo(Math.random() * w, y); ctx.lineTo(Math.random() * w, y); ctx.stroke();
      ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      ctx.beginPath(); ctx.moveTo(Math.random() * w, y + 1); ctx.lineTo(Math.random() * w, y + 1); ctx.stroke();
    }
  });
}

function perfTex(color) {
  return canvasTex('perf' + color, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = hex(color); ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 8; x < w; x += 16) {
      for (let y = 8; y < h; y += 16) {
        ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

function pcbTex(color) {
  return canvasTex('pcb' + color, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = hex(color); ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(150,220,180,0.18)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 140; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      const segs = 3 + (Math.random() * 3 | 0);
      for (let s = 0; s < segs; s++) {
        if (Math.random() > 0.5) x += rnd(-40, 40); else y += rnd(-40, 40);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(214,178,90,0.7)';
    for (let i = 0; i < 260; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
  });
}

function logoTexture(text, opts = {}) {
  const { bg = 0x00000000, fg = '#ffffff', size = 96, w = 512, h = 160 } = opts;
  return canvasTex(`logo:${text}:${fg}:${size}:${w}:${h}`, w, h, (ctx, cw, ch) => {
    ctx.clearRect(0, 0, cw, ch);
    if (bg !== 0x00000000) { ctx.fillStyle = hex(bg); ctx.fillRect(0, 0, cw, ch); }
    ctx.fillStyle = fg;
    ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cw / 2, ch / 2);
  });
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function brushedMat(color, rough = 0.35, metal = 0.85) {
  const map = brushedTex(color);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, metalness: metal, roughness: rough });
  return m;
}
function solidMat(color, rough = 0.6, metal = 0.15) {
  return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
}
function pcbMat(color) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: pcbTex(color), metalness: 0.25, roughness: 0.8 });
}
function emissiveMat(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveIntensity: intensity, metalness: 0.3, roughness: 0.35 });
}
function glassMat() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x9fd4ff, metalness: 0, roughness: 0.03, transmission: 1.0,
    transparent: true, opacity: 0.22, ior: 1.5, thickness: 0.5,
    attenuationColor: new THREE.Color(0x6ba8d0), attenuationDistance: 6,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.04
  });
}
function perfMat(color) {
  const map = perfTex(color);
  return new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: 0xffffff });
}

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------
function rbox(w, h, d, material, radius = 0.12) {
  const r = Math.min(radius, Math.min(w, h, d) * 0.45);
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.max(r, 0.001));
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function box(w, h, d, material) { return rbox(w, h, d, material, 0.001); }
function cyl(rt, rb, h, material, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function put(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}
function tag(group, category, partId) {
  group.userData.selectable = true;
  group.userData.category = category;
  group.userData.partId = partId;
  return group;
}

// ---------------------------------------------------------------------------
// A realistic case fan (axis points along +Z)
// ---------------------------------------------------------------------------
let bladeGeoCache = {};
function bladeGeometry(radius) {
  const key = Math.round(radius * 100);
  if (bladeGeoCache[key]) return bladeGeoCache[key];
  const s = new THREE.Shape();
  s.moveTo(radius * 0.28, 0);
  s.quadraticCurveTo(radius * 0.62, radius * 0.16, radius * 0.96, radius * 0.5);
  s.lineTo(radius * 0.82, radius * 0.66);
  s.quadraticCurveTo(radius * 0.6, radius * 0.36, radius * 0.28, radius * 0.14);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: radius * 0.05, bevelEnabled: true, bevelThickness: radius * 0.012,
    bevelSize: radius * 0.012, bevelSegments: 1, curveSegments: 10
  });
  geo.userData.shared = true;
  bladeGeoCache[key] = geo;
  return geo;
}

function buildFan(radius, opts = {}) {
  const { color = 0x00e0c6, frameColor = 0x14171c, blades = 9, rgb = false } = opts;
  const g = new THREE.Group();
  const frameMat = solidMat(frameColor, 0.7, 0.25);
  const barW = radius * 0.22;
  const depth = radius * 0.5;

  g.add(put(rbox(radius * 2, barW, depth, frameMat, barW * 0.35), 0, radius - barW / 2, 0));
  g.add(put(rbox(radius * 2, barW, depth, frameMat, barW * 0.35), 0, -(radius - barW / 2), 0));
  g.add(put(rbox(barW, radius * 2 - 2 * barW, depth, frameMat, barW * 0.35), -(radius - barW / 2), 0, 0));
  g.add(put(rbox(barW, radius * 2 - 2 * barW, depth, frameMat, barW * 0.35), (radius - barW / 2), 0, 0));

  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, barW * 0.32, 10, 32), frameMat);
  ring.castShadow = true;
  g.add(put(ring, 0, 0, 0));

  const bladeMat = new THREE.MeshStandardMaterial({
    color, metalness: 0.25, roughness: 0.45, transparent: true, opacity: 0.92,
    emissive: rgb ? color : 0x000000, emissiveIntensity: rgb ? 0.5 : 0
  });
  for (let i = 0; i < blades; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / blades) * Math.PI * 2;
    const b = new THREE.Mesh(bladeGeometry(radius), bladeMat);
    b.castShadow = true;
    b.rotation.x = 0.5;
    b.rotation.z = 0.1;
    arm.add(b);
    g.add(arm);
  }
  const hub = cyl(radius * 0.3, radius * 0.3, depth * 0.9, solidMat(0x0c0e11, 0.5, 0.4));
  if (rgb) hub.material = emissiveMat(color, 1.1);
  g.add(put(hub, 0, 0, 0, Math.PI / 2));
  return g;
}

// ---------------------------------------------------------------------------
// Cables
// ---------------------------------------------------------------------------
function cable(points, radius = 0.28, color = 0x0e1013) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 40, radius, 8, false);
  const mesh = new THREE.Mesh(geo, solidMat(color, 0.9, 0.05));
  mesh.castShadow = true;
  return mesh;
}

// ===========================================================================
// CASE
// ===========================================================================
export function buildCase(part) {
  const g = new THREE.Group();
  const { W, H, D } = LAYOUT;
  const shell = brushedMat(part.color, 0.42, 0.8);
  const accent = part.accent || 0x00e0c6;
  const style = part.style || 'airflow';

  // Structural frame: floor, roof, back (both side covers left open)
  g.add(put(rbox(W, 0.6, D, shell), 0, 0.3, 0));
  g.add(put(rbox(W, 0.6, D, shell), 0, H - 0.3, 0));
  g.add(put(rbox(W, H, 0.6, shell), 0, H / 2, -D / 2));
  // Motherboard tray: a plate the size of the board, not a full side wall,
  // so nothing hides the internals from the left either.
  g.add(put(rbox(0.4, 25, 31, brushedMat(0x181b20, 0.45, 0.7), 0.2), -W / 2 + 0.9, LAYOUT.boardY + 12.2, LAYOUT.boardZ + 15.2));

  // Corner posts with accent
  const postMat = brushedMat(0x1a1d22, 0.4, 0.85);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(put(rbox(0.9, H, 0.9, postMat, 0.2), sx * (W / 2 - 0.5), H / 2, sz * (D / 2 - 0.5)));
  }

  // Front panel by style
  if (style === 'wood') {
    g.add(put(rbox(W, H, 0.9, brushedMat(0x2b2d28, 0.5, 0.6)), 0, H / 2, D / 2));
    const wood = solidMat(0x7c5a33, 0.85, 0.05);
    for (let i = 0; i < 9; i++) {
      g.add(put(rbox(W - 2, 3.0, 0.6, wood, 0.25), 0, 5 + i * 4.4, D / 2 + 0.5));
    }
    g.add(put(box(0.5, H - 8, 0.4, emissiveMat(accent, 1.0)), -W / 2 + 1.6, H / 2, D / 2 + 0.9));
  } else if (style === 'airflow' || style === 'compact') {
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, H - 0.6), perfMat(part.color));
    g.add(put(front, 0, H / 2, D / 2 + 0.35));
    g.add(put(rbox(W, 0.7, 0.7, shell), 0, H - 0.35, D / 2));
    g.add(put(rbox(W, 0.7, 0.7, shell), 0, 0.35, D / 2));
    g.add(put(rbox(0.7, H, 0.7, shell), -(W / 2 - 0.35), H / 2, D / 2));
    g.add(put(rbox(0.7, H, 0.7, shell), (W / 2 - 0.35), H / 2, D / 2));
  } else if (style === 'dualchamber') {
    // O11-style: glass front, both sides open to show the build
    g.add(put(box(W - 2, H - 2, 0.25, glassMat()), 0, H / 2, D / 2));
    g.add(put(rbox(0.7, H, 0.7, postMat), -(W / 2 - 0.4), H / 2, D / 2 - 0.4));
  } else {
    // solid / silent
    g.add(put(rbox(W, H, 0.9, brushedMat(part.color, 0.4, 0.75)), 0, H / 2, D / 2));
    for (let i = 0; i < 6; i++) {
      g.add(put(box(W - 3, 0.5, 0.4, solidMat(0x0c0e11, 0.7)), 0, 6 + i * 6.5, D / 2 - 0.5));
    }
    g.add(put(box(0.5, H - 10, 0.4, emissiveMat(accent, 1.0)), -W / 2 + 1.6, H / 2, D / 2 + 0.5));
  }

  // Side cover removed so the internals are visible from the camera side.
  // Only slim rails remain to frame the open panel.
  g.add(put(rbox(0.7, 0.7, D, shell), W / 2 - 0.35, H - 0.35, 0));
  g.add(put(rbox(0.7, 0.7, D, shell), W / 2 - 0.35, 0.35, 0));
  g.add(put(rbox(0.7, H, 0.8, shell), W / 2 - 0.35, H / 2, -D / 2 + 0.4));
  g.add(put(rbox(0.7, H, 0.8, shell), W / 2 - 0.35, H / 2, D / 2 - 0.4));

  // Feet
  const footMat = solidMat(0x0b0d10, 0.9, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(put(cyl(0.8, 0.8, 1.0, footMat, 16), sx * (W / 2 - 1.6), -0.4, sz * (D / 2 - 1.6)));
  }

  // Front intake fans (visible through mesh)
  for (let i = 0; i < part.fans; i++) {
    g.add(put(buildFan(5.8, { color: 0x2b3038, frameColor: 0x0f1114 }), 0, 12 + i * 12, D / 2 - 2.4));
  }

  // Cable loom (aesthetic, routed from the front-bottom toward the board)
  g.add(cable([[3, 5.5, 6], [2, 12, 8], [0, 20, 6]], 0.35, 0x0c0e11));

  return tag(g, 'case', part.id);
}

// ===========================================================================
// MOTHERBOARD
// ===========================================================================
export function buildMotherboard(part) {
  const g = new THREE.Group();
  const size = BOARD_SIZE[part.formFactor] || BOARD_SIZE['ATX'];
  const { boardZ, boardY, trayX } = LAYOUT;
  const centerZ = boardZ + size.z / 2;
  const centerY = boardY + size.y / 2;
  const accent = part.accent || 0xff2d55;
  const brandDark = (BRAND[part.brand] || {}).dark || 0x101418;

  // PCB with solder mask + traces
  g.add(put(box(0.3, size.y, size.z, pcbMat(part.color)), trayX, centerY, centerZ));

  const dark = solidMat(0x0b0d10, 0.6, 0.3);
  const silver = brushedMat(0x8f99a3, 0.35, 0.9);
  const shroudMat = brushedMat(brandDark, 0.35, 0.7);

  // Large rear I/O shroud with RGB logo bar
  g.add(put(rbox(3.0, 5.5, 9.0, shroudMat, 0.3), trayX + 1.6, boardY + size.y - 2.9, boardZ + 4.5));
  g.add(put(box(0.4, 1.4, 4.5, emissiveMat(accent, 1.7)), trayX + 3.2, boardY + size.y - 2.9, boardZ + 4.5));
  // VRM heatsink (finned)
  const vrm = new THREE.Group();
  vrm.add(put(rbox(2.6, 2.0, size.z * 0.5, shroudMat, 0.2), 0, 0, 0));
  for (let i = 0; i < 7; i++) vrm.add(put(box(2.7, 1.6, 0.35, silver), 0, 0.2, -size.z * 0.24 + i * (size.z * 0.48 / 6)));
  g.add(put(vrm, trayX + 1.4, boardY + size.y - 0.9, boardZ + size.z * 0.62));

  // Chipset heatsink with accent slash
  g.add(put(rbox(2.2, 3.0, 4.6, shroudMat, 0.4), trayX + 1.1, boardY + 5.2, boardZ + size.z - 4.5));
  g.add(put(box(0.4, 0.7, 3.2, emissiveMat(accent, 1.4)), trayX + 2.2, boardY + 5.8, boardZ + size.z - 4.5));

  // CPU socket: LGA pins / AM5 socket
  if (part.socket === 'LGA1700') {
    g.add(put(box(0.35, 4.6, 4.6, solidMat(0x1b2026, 0.5, 0.6)), trayX + 0.25, boardY + 15.5, boardZ + 6.5));
    const pinMat = solidMat(0xc9a227, 0.4, 1.0);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      g.add(put(box(0.06, 0.06, 0.06, pinMat), trayX + 0.42, boardY + 13.6 + i * 0.5, boardZ + 4.6 + j * 0.5));
    }
    g.add(put(rbox(4.4, 0.4, 4.4, silver, 0.1), trayX + 0.55, boardY + 15.5, boardZ + 6.5));
  } else {
    const am5 = solidMat(0x15181c, 0.5, 0.5);
    g.add(put(box(0.4, 5.0, 5.0, am5), trayX + 0.25, boardY + 15.5, boardZ + 6.5));
    g.add(put(box(0.5, 3.6, 3.6, solidMat(0x6b7280, 0.4, 0.9)), trayX + 0.35, boardY + 15.5, boardZ + 6.5));
  }

  // DIMM slots with latches
  const dimmZ = boardZ + 12.5;
  for (let i = 0; i < 4; i++) {
    const z = dimmZ + (i - 1.5) * 1.05;
    g.add(put(box(0.6, 11.5, 0.5, dark), trayX + 0.45, boardY + 13, z));
    g.add(put(box(0.8, 0.7, 0.7, solidMat(i % 2 ? accent : 0x2a2f36, 0.5, 0.4)), trayX + 0.5, boardY + 19.3, z));
    g.add(put(box(0.8, 0.7, 0.7, solidMat(0x2a2f36, 0.5, 0.4)), trayX + 0.5, boardY + 6.6, z));
  }

  // PCIe slots (metal reinforced)
  g.add(put(rbox(0.7, 1.1, 11, silver, 0.15), trayX + 0.7, boardY + 2.0, boardZ + 7.5));
  g.add(put(rbox(0.7, 1.0, 9, dark, 0.15), trayX + 0.7, boardY + 5.0, boardZ + 6.5));

  // M.2 shields with pads
  for (let i = 0; i < Math.min(part.m2Slots, 3); i++) {
    g.add(put(rbox(1.1, 2.8, 8.0, silver, 0.2), trayX + 0.85, boardY + 6 + i * 3.4, boardZ + size.z * 0.32));
  }

  // SATA ports
  for (let i = 0; i < 4; i++) {
    g.add(put(rbox(0.9, 0.9, 0.9, solidMat(accent, 0.6, 0.3), 0.12), trayX + 0.85, boardY + 2.4, boardZ + 2.6 + i * 1.5));
  }

  // 24-pin header
  g.add(put(rbox(1.3, 3.2, 6.4, solidMat(0x22262d, 0.6, 0.3), 0.15), trayX + 1.1, boardY + 11, boardZ + size.z - 1.4));

  // Rear I/O port cluster on the back edge
  const ports = [0x2f80ed, 0x2f80ed, 0x27ae60, 0xe67e22, 0x8e44ad, 0x2980b9];
  ports.forEach((c, i) => {
    g.add(put(box(1.2, 0.9, 0.9, solidMat(c, 0.5, 0.4)), trayX + 1.0, boardY + size.y - 5.6 + (i % 3) * 1.1, boardZ + 0.8 + Math.floor(i / 3) * 2.2));
  });

  return tag(g, 'motherboard', part.id);
}

// ===========================================================================
// CPU
// ===========================================================================
export function buildCPU(part) {
  const g = new THREE.Group();
  const x = LAYOUT.boardFace;
  const y = LAYOUT.boardY + 15.5;
  const z = LAYOUT.boardZ + 6.5;

  g.add(put(box(0.4, 5.6, 5.6, pcbMat(0x0a3a2a)), x + 0.3, y, z));
  // SMD capacitors on the edges
  const capMat = solidMat(0x2a2f36, 0.5, 0.3);
  for (let i = 0; i < 5; i++) {
    g.add(put(box(0.15, 0.3, 0.3, capMat), x + 0.55, y - 2.4 + i * 1.2, z - 2.9));
  }
  // IHS with engraved branding
  const ihs = part.brand === 'amd' ? 0xd2d8df : 0xc7ced6;
  g.add(put(rbox(0.7, 4.4, 4.4, brushedMat(ihs, 0.35, 0.95), 0.12), x + 0.6, y, z));
  const label = part.brand === 'amd' ? 'RYZEN' : 'CORE';
  const tex = logoTexture(label, { fg: '#8b939c', size: 84, w: 512, h: 128 });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.0),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.6, roughness: 0.5 })
  );
  g.add(put(plate, x + 0.96, y, z, 0, Math.PI / 2, 0));
  const accent = part.brand === 'amd' ? 0xed1c24 : 0x0a72d6;
  g.add(put(box(0.12, 4.7, 4.7, solidMat(accent, 0.6, 0.3)), x + 0.42, y, z));

  return tag(g, 'cpu', part.id);
}

// ===========================================================================
// CPU COOLER
// ===========================================================================
export function buildCooler(part) {
  const g = new THREE.Group();
  const x = LAYOUT.boardFace;
  const y = LAYOUT.boardY + 15.5;
  const z = LAYOUT.boardZ + 6.5;
  const b = BRAND[part.brand] || {};

  if (part.type === 'Air') {
    const height = mm(part.height);
    const fins = brushedMat(b.fins || 0xb9c1cb, 0.35, 0.9);
    const towers = part.layout === 'dual' ? 2 : 1;
    const towerDepth = 12;

    // copper base
    g.add(put(rbox(0.8, 5.0, 5.0, brushedMat(0xb87333, 0.3, 0.95), 0.1), x + 0.6, y, z));

    // one or two fin towers
    const towerCenters = towers === 2 ? [z - 3.4, z + 3.4] : [z];
    for (const tz of towerCenters) {
      const towerX = x + height / 2;
      // heatpipes
      const pipeMat = brushedMat(0xb87333, 0.28, 0.98);
      for (let i = 0; i < 4; i++) {
        const p = cyl(0.32, 0.32, height - 1.2, pipeMat, 12);
        g.add(put(p, x + height / 2, y - 1.4 + i * 0.9, tz - 1.0 + i * 0.6, 0, 0, Math.PI / 2));
      }
      // fin stack
      const finN = 18;
      const finW = 5.2;
      for (let i = 0; i < finN; i++) {
        g.add(put(box(height * 0.94, 0.16, towerDepth, fins), towerX, y - finW / 2 + (i / (finN - 1)) * finW, tz));
      }
      // top plate (brand color)
      g.add(put(rbox(height * 0.94, 0.5, towerDepth, solidMat(b.top || 0x1a1d22, 0.5, 0.4), 0.15), towerX, y + finW / 2 + 0.2, tz));
    }

    // fans
    const fanOpts = { color: b.fan || 0x101216, frameColor: b.fanDark || 0x2a2f36 };
    g.add(put(buildFan(5.4, fanOpts), x + height * 0.4, y, z + (towers === 2 ? 5.2 : towerDepth / 2 + 0.9)));
    if (towers === 2) g.add(put(buildFan(5.4, fanOpts), x + height * 0.4, y, z - 5.2));

  } else {
    // AIO
    const pumpMat = brushedMat(0x15181c, 0.35, 0.5);
    const pump = new THREE.Group();
    pump.add(put(rbox(4.6, 5.4, 5.4, pumpMat, 0.5), 0, 0, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.22, 10, 32), emissiveMat(b.accent || 0x00e0c6, 1.7));
    pump.add(put(ring, 2.35, 0, 0, 0, Math.PI / 2, 0));
    pump.add(put(cyl(1.6, 1.6, 0.3, solidMat(0x0a0c0f, 0.4, 0.5), 24), 2.45, 0, 0, 0, 0, Math.PI / 2));
    g.add(put(pump, x + 2.8, y, z));

    // braided tubes
    const tubeMat = solidMat(0x0c0e11, 0.9, 0.05);
    g.add(cable([[x + 4.2, y + 2, z + 1.4], [x + 3.5, y + 12, z + 0.5], [x + 1.0, LAYOUT.H - 5.0, z + 0.2]], 0.55, tubeMat.color.getHex()));
    g.add(cable([[x + 3.6, y + 2, z + 2.2], [x + 2.4, y + 12, z + 1.4], [x + 1.0, LAYOUT.H - 5.0, z + 1.6]], 0.55, tubeMat.color.getHex()));

    // radiator + fans on top
    const radLen = mm(part.radiator);
    const radY = LAYOUT.H - 3.4;
    const radZ = -1;
    g.add(put(rbox(12.5, 2.8, radLen, brushedMat(0x25282e, 0.4, 0.7), 0.25), 0, radY, radZ));
    const finMat = brushedMat(0x9aa3ad, 0.35, 0.9);
    for (let i = 0; i < 14; i++) {
      g.add(put(box(11.6, 0.18, 0.22, finMat), 0, radY + 1.35, radZ - radLen / 2 + (i / 13) * radLen));
    }
    const fanCount = part.radiator >= 360 ? 3 : 2;
    for (let i = 0; i < fanCount; i++) {
      const fz = radZ - radLen / 2 + (radLen / fanCount) * (i + 0.5);
      g.add(put(buildFan(5.6, { color: b.fan || 0x101216, frameColor: b.fanDark || 0x2a2f36 }), 0, radY - 2.6, fz, Math.PI / 2, 0, 0));
    }
  }

  return tag(g, 'cooler', part.id);
}

// ===========================================================================
// RAM
// ===========================================================================
export function buildRAM(part) {
  const g = new THREE.Group();
  const sticks = Math.min(part.sticks || 2, 4);
  const dimmZ = LAYOUT.boardZ + 12.5;
  const y = LAYOUT.boardY + 13;
  const baseX = LAYOUT.boardFace;
  const heatColor = part.rgb ? 0x1c2027 : (part.brand === 'kingston' ? 0x1b1e24 : 0x22262d);
  const heatMat = brushedMat(heatColor, 0.4, 0.7);
  const trimMat = brushedMat(0x8f99a3, 0.3, 0.9);
  const rgbColor = part.ramType === 'DDR5' ? 0x2b6cff : 0x18e06a;
  const startOffset = (sticks - 1) / 2;

  for (let i = 0; i < sticks; i++) {
    const z = dimmZ + (i - startOffset) * 1.05;
    // connector tab seated in the DIMM slot
    g.add(put(box(0.9, 10.6, 0.55, solidMat(0x0e1013, 0.6, 0.3)), baseX + 0.5, y, z));
    // heatspreader: thin along Z, tall along Y, extends out of the board along X
    g.add(put(rbox(3.0, 11.6, 0.55, heatMat, 0.12), baseX + 1.8, y, z));
    // brushed metal accent on the outer top edge
    g.add(put(box(0.35, 9.5, 0.62, trimMat), baseX + 3.2, y - 0.4, z));
    // top RGB diffuser
    if (part.rgb) {
      g.add(put(rbox(3.0, 1.2, 0.62, emissiveMat(rgbColor, 2.0), 0.2), baseX + 1.8, y + 5.9, z));
    }
    // label on the wide face
    const tex = logoTexture(part.ramType, { fg: '#c9d3de', size: 96, w: 256, h: 96 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.4, roughness: 0.5 }));
    g.add(put(plate, baseX + 1.6, y - 2.4, z + 0.3));
  }

  return tag(g, 'ram', part.id);
}

// ===========================================================================
// GRAPHICS CARD
// ===========================================================================
export function buildGPU(part) {
  const g = new THREE.Group();
  const len = mm(part.length);
  const cardH = 9.6;
  const thick = (part.slot || 2) * 1.7;
  const x = LAYOUT.boardFace + thick / 2 + 0.6;
  const y = LAYOUT.gpuSlotY;
  const startZ = LAYOUT.boardZ + 2;
  const z = startZ + len / 2;
  const b = BRAND[part.brand] || { accent: 0x76b900, dark: 0x1a1c1f };

  // shroud + backplate
  g.add(put(rbox(thick, cardH, len, brushedMat(0x14171c, 0.45, 0.55), 0.35), x, y, z));
  g.add(put(rbox(thick * 0.9, 0.5, len - 1.2, brushedMat(0x1d2126, 0.4, 0.7), 0.2), x, y + cardH / 2 + 0.2, z));
  // dark ventilated top
  const top = new THREE.Mesh(new THREE.PlaneGeometry(thick * 0.7, len - 2), perfMat(0x000000));
  g.add(put(top, x, y + cardH / 2 + 0.45, z, -Math.PI / 2, 0, 0));
  // accent light strip along the side
  g.add(put(box(0.4, 0.7, len - 2, emissiveMat(b.accent, 1.8)), x + thick / 2 + 0.1, y + cardH / 2 - 1.4, z));

  // fans across the length (bottom face)
  const fanCount = part.fans || (len > 28 ? 3 : 2);
  for (let i = 0; i < fanCount; i++) {
    const fz = startZ + (len / fanCount) * (i + 0.5);
    g.add(put(buildFan(4.4, { color: 0x1a1d22, frameColor: 0x0e1114, rgb: i === 0 }), x + thick / 2 + 0.3, y - 0.2, fz, 0, Math.PI / 2, 0));
  }

  // I/O bracket + display outputs
  g.add(put(rbox(thick + 0.4, cardH + 0.8, 0.5, brushedMat(0xb8c0cc, 0.3, 0.95), 0.1), x, y, startZ - 0.45));
  for (let i = 0; i < 4; i++) {
    const portMat = solidMat(i === 3 ? 0x111318 : 0x1c2027, 0.5, 0.4);
    g.add(put(box(1.1, 0.7, 0.4, portMat), x - 0.7, y + 2.6 - i * 1.7, startZ - 0.7));
  }

  // power connector(s) on the top edge
  g.add(put(rbox(1.6, 0.9, 3.2, solidMat(0x2a2f36, 0.6, 0.3), 0.15), x, y + cardH / 2 + 0.4, startZ + len * 0.5));

  // logo plate on the shroud
  const tex = logoTexture(part.brand === 'nvidia' ? 'GEFORCE RTX' : 'RADEON', { fg: hex(b.accent), size: 72, w: 512, h: 96 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.45, 1.6), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.3, roughness: 0.5 }));
  g.add(put(plate, x + thick / 2 + 0.6, y + cardH / 2 - 2.6, z, 0, Math.PI / 2, 0));

  return tag(g, 'gpu', part.id);
}

// ===========================================================================
// STORAGE
// ===========================================================================
export function buildStorage(part) {
  const g = new THREE.Group();

  if (part.form === 'M.2') {
    const x = LAYOUT.boardFace + 0.5;
    const y = LAYOUT.boardY + 4.5;
    const z = LAYOUT.boardZ + 9;
    g.add(put(box(0.35, 1.4, 8, pcbMat(0x0a3a2a)), x, y, z));
    // controller + NAND + DRAM
    g.add(put(rbox(0.5, 1.0, 1.4, solidMat(0x15181c, 0.6, 0.3), 0.05), x + 0.35, y, z - 3.0));
    g.add(put(rbox(0.5, 1.0, 2.0, solidMat(0x1b2026, 0.6, 0.3), 0.05), x + 0.35, y, z + 0.4));
    // heatsink plate with label
    g.add(put(rbox(0.6, 2.0, 8.2, brushedMat(0x2f343b, 0.35, 0.85), 0.15), x + 0.55, y, z));
    g.add(put(box(0.65, 0.7, 2.2, emissiveMat(0xffa000, 0.8)), x + 0.85, y, z - 3.0));
  } else {
    const is35 = part.form === '3.5"';
    const w = 10, h = is35 ? 2.6 : 1.0, d = is35 ? 14 : 7;
    const x = 6, y = is35 ? 3.6 : 3.0, z = 8;
    const bodyMat = brushedMat(0x3a3f47, 0.4, 0.8);
    if (is35) {
      // HDD: aluminium body + top plate + spindle
      g.add(put(rbox(w, h, d, bodyMat, 0.25), x, y, z));
      g.add(put(rbox(w - 0.6, 0.5, d - 0.6, brushedMat(0x50565e, 0.3, 0.85), 0.15), x, y + h / 2 + 0.15, z));
      g.add(put(cyl(2.2, 2.2, 0.3, solidMat(0x2a2f36, 0.4, 0.6), 24), x - 1.5, y + h / 2 + 0.35, z, 0, 0, 0));
    } else {
      // 2.5" SSD
      g.add(put(rbox(w, h, d, bodyMat, 0.2), x, y, z));
      const tex = logoTexture(part.brand || 'SSD', { fg: '#d7dde5', size: 80, w: 256, h: 128 });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, d - 1.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.4, roughness: 0.5 }));
      g.add(put(plate, x, y + h / 2 + 0.05, z, -Math.PI / 2, 0, 0));
    }
    // SATA connectors on the back
    g.add(put(box(0.8, h * 0.6, 1.6, solidMat(0x0e1013, 0.6, 0.3)), x - w / 2, y, z + d / 2 + 0.4));
    g.add(put(box(0.5, 0.5, 1.8, emissiveMat(0x00e0c6, 0.9)), x + w / 2 - 0.6, y, z + d / 2 + 0.4));
  }

  return tag(g, 'storage', part.id);
}

// ===========================================================================
// POWER SUPPLY
// ===========================================================================
export function buildPSU(part) {
  const g = new THREE.Group();
  const w = 15, h = 8.6, d = 16;
  const x = 0, y = 4.4;
  const z = LAYOUT.boardZ + 12;

  g.add(put(rbox(w, h, d, brushedMat(0x1b1e23, 0.45, 0.6), 0.3), x, y, z));

  // fan + grill underneath
  g.add(put(buildFan(5.4, { color: 0x2b3038, frameColor: 0x0f1114 }), x, y - h / 2 - 0.1, z, Math.PI / 2, 0, 0));
  const grill = new THREE.Mesh(new THREE.RingGeometry(5.0, 5.6, 40), brushedMat(0x444a52, 0.4, 0.9));
  g.add(put(grill, x, y - h / 2 - 0.25, z, Math.PI / 2, 0, 0));

  // side label with brand + wattage
  const tex = logoTexture(`${part.brand}`, { fg: '#e8eef7', size: 76, w: 512, h: 160 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(d - 2, h - 1.6), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.2, roughness: 0.6, color: 0x40464e }));
  g.add(put(label, x + w / 2 + 0.05, y, z, 0, Math.PI / 2, 0));

  // wattage accent
  g.add(put(box(0.25, 1.6, 5, emissiveMat(0xffd166, 1.2)), x - w / 2 - 0.05, y + 1, z));

  // modular sockets
  for (let i = 0; i < 5; i++) {
    g.add(put(rbox(0.8, 1.7, 1.7, solidMat(0x0b0d10, 0.6, 0.3), 0.1), x - w / 2 - 0.2, y, z - 5 + i * 2.4));
  }

  // cable bundle from the modular panel
  const cmat = 0x0c0e11;
  g.add(cable([[x - w / 2 - 0.4, y + 2.5, z - 5], [x - 5, y + 6, z - 5.5], [x - 7.5, y + 6.5, z - 6.5]], 0.5, cmat));
  g.add(cable([[x - w / 2 - 0.4, y + 2.5, z - 2.6], [x - 4.5, y + 8, z - 3], [x - 7.3, y + 8, z - 5.5]], 0.35, cmat));

  return tag(g, 'psu', part.id);
}

// ---------------------------------------------------------------------------
// Registry + disposal
// ---------------------------------------------------------------------------
export const BUILDERS = {
  case: buildCase,
  motherboard: buildMotherboard,
  cpu: buildCPU,
  cooler: buildCooler,
  ram: buildRAM,
  gpu: buildGPU,
  storage: buildStorage,
  psu: buildPSU
};

export function buildPart(category, part) {
  const fn = BUILDERS[category];
  return fn ? fn(part) : null;
}

// Geometries flagged `shared` (buffer-geometry caches) and every canvas
// texture (the `texCache`) are reused across parts, so they are left
// untouched here — only per-part geometry and materials are released.
export function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => m.dispose());
    }
  });
}
