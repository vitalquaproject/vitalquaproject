// =========================================================
// Vitalqua Project — Building / Coming Soon page
//   - 6 water drops floating with idle wobble
//   - Sun + Moon (crescent) in opposite corners, crossfading over
//     a ~18-second day/night cycle
//   - Page background + text colours tween along with the cycle
// =========================================================

const N = 60;
const SVG_NS = 'http://www.w3.org/2000/svg';
const field  = document.getElementById('tri-field');

// ---- Palettes ------------------------------------------------
// Drops (cyan water gradient, 4 tones)
const D_HI  = '#B8E4EE';   // brightest highlight
const D_LIT = '#7ACAE0';   // lit face
const D_MED = '#4FB3D9';   // transition
const D_DK  = '#2A85B3';   // shadow

// Sun (4 tones)
const SUN_HI = '#FFE066';
const SUN_MED = '#FFD34E';
const SUN_LO = '#FFBF3A';

// Moon crescent (4 tones)
const MOON_HI     = '#F4E8C0';
const MOON_MED    = '#E8DCB0';
const MOON_LO     = '#D9C99A';
const MOON_DIMMER = '#C9B88A';

// Day and night themes — bg, halo, text colours
const DAY = {
  bg:            '#FCE7B9',
  halo:          'rgba(252, 231, 185, 0.95)',
  textPrimary:   '#1F1910',
  textSecondary: '#4A3A22',
  panelBg:       'rgba(255, 255, 255, 0.35)',
  panelBorder:   'rgba(255, 255, 255, 0.55)',
  accent:        '#2D5B9C'
};
const NIGHT = {
  bg:            '#0E1C36',
  halo:          'rgba(14, 28, 54, 0.95)',
  textPrimary:   '#F4F6FA',
  textSecondary: '#BBC8DC',
  panelBg:       'rgba(30, 47, 78, 0.55)',
  panelBorder:   'rgba(180, 200, 220, 0.25)',
  accent:        '#7FCDE3'
};

// ---- Tiny helpers --------------------------------------------
function lerp(a, b, t) { return a + (b - a) * t; }

function parseHex(h) {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function toHex(n) { return n.toString(16).padStart(2,'0'); }
function lerpHex(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  return `#${toHex(Math.round(lerp(ca[0], cb[0], t)))}${toHex(Math.round(lerp(ca[1], cb[1], t)))}${toHex(Math.round(lerp(ca[2], cb[2], t)))}`;
}
function parseRgba(s) {
  // "rgba(r, g, b, a)"
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0,0,0,1];
  return m[1].split(',').map((v, i) => i < 3 ? parseFloat(v) : parseFloat(v));
}
function lerpRgba(a, b, t) {
  const ca = parseRgba(a), cb = parseRgba(b);
  return `rgba(${Math.round(lerp(ca[0], cb[0], t))}, ${Math.round(lerp(ca[1], cb[1], t))}, ${Math.round(lerp(ca[2], cb[2], t))}, ${lerp(ca[3], cb[3], t).toFixed(3)})`;
}
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Compact triangle constructor
const T = (x1, y1, x2, y2, x3, y3, f) => ({
  p: [[x1, y1], [x2, y2], [x3, y3]],
  f
});

// ---- Drop builder (8 tris — 2 upper tip + 6 half-octagon fan) ----
function drop(cx, cy, R, H) {
  const p1x = cx + 0.866 * R, p1y = cy + 0.5   * R;
  const p2x = cx + 0.5   * R, p2y = cy + 0.866 * R;
  const p3x = cx,             p3y = cy + R;
  const p4x = cx - 0.5   * R, p4y = cy + 0.866 * R;
  const p5x = cx - 0.866 * R, p5y = cy + 0.5   * R;
  return [
    T(cx, cy - H,  cx - R, cy,  cx, cy,       D_MED),
    T(cx, cy - H,  cx, cy,      cx + R, cy,   D_HI),
    T(cx, cy,  cx + R, cy,  p1x, p1y,         D_HI),
    T(cx, cy,  p1x, p1y,    p2x, p2y,         D_LIT),
    T(cx, cy,  p2x, p2y,    p3x, p3y,         D_LIT),
    T(cx, cy,  p3x, p3y,    p4x, p4y,         D_MED),
    T(cx, cy,  p4x, p4y,    p5x, p5y,         D_DK),
    T(cx, cy,  p5x, p5y,    cx - R, cy,       D_DK)
  ];
}

// ---- Scene composition (60 tris) ---------------------------------
// 6 drops at the periphery (leaves the centre free for the text):
//   - 2 small drops in the top corners
//   - 2 medium drops on the middle sides
//   - 2 small drops near the bottom
// Then the Sun (4 tris) and Moon crescent (8 tris).
const SCENE = [
  // ---- 0–7  Drop A  (small, upper-left) ----
  ...drop(22, 30, 5, 8),
  // ---- 8–15 Drop B  (small, upper-right) ----
  ...drop(140, 32, 5, 8),
  // ---- 16–23 Drop C (medium, mid-left) ----
  ...drop(18, 102, 9, 14),
  // ---- 24–31 Drop D (medium, mid-right) ----
  ...drop(144, 108, 8, 13),
  // ---- 32–39 Drop E (tiny, lower-left) ----
  ...drop(58, 160, 4, 6),
  // ---- 40–47 Drop F (small, lower-right) ----
  ...drop(115, 158, 6, 10),

  // ---- 48–51 SUN — 4-wedge diamond at (46, 54) ----
  T(46, 54,  54, 54,  46, 46, SUN_HI),   // top-right
  T(46, 54,  46, 46,  38, 54, SUN_HI),   // top-left
  T(46, 54,  38, 54,  46, 62, SUN_LO),   // bottom-left (shadow)
  T(46, 54,  46, 62,  54, 54, SUN_MED),  // bottom-right

  // ---- 52–59 MOON CRESCENT at virtual centre (116, 54), r=8, inner offset -5 ----
  // 4 quads × 2 tris. Outer arc sampled θ = -75°, -37.5°, 0°, 37.5°, 75°
  // Outer pts: (118, 46.3), (122.3, 49.1), (124, 54), (122.3, 58.9), (118, 61.7)
  // Inner pts: (113, 46.3), (117.3, 49.1), (119, 54), (117.3, 58.9), (113, 61.7)
  // Top horn
  T(118, 46,  122, 49,  117, 49, MOON_LO),
  T(118, 46,  117, 49,  113, 46, MOON_DIMMER),
  // Upper belly
  T(122, 49,  124, 54,  119, 54, MOON_HI),
  T(122, 49,  119, 54,  117, 49, MOON_MED),
  // Lower belly
  T(124, 54,  122, 59,  117, 59, MOON_HI),
  T(124, 54,  117, 59,  119, 54, MOON_MED),
  // Bottom horn
  T(122, 59,  118, 62,  113, 62, MOON_LO),
  T(122, 59,  113, 62,  117, 59, MOON_DIMMER)
];

// ---- Build 60 <polygon> nodes once ---------------------------
const polys = [];
for (let i = 0; i < N; i++) {
  const p = document.createElementNS(SVG_NS, 'polygon');
  p.setAttribute('class', 'tri');
  const tr = SCENE[i];
  p.setAttribute('points',
    `${tr.p[0][0]},${tr.p[0][1]} ${tr.p[1][0]},${tr.p[1][1]} ${tr.p[2][0]},${tr.p[2][1]}`);
  p.setAttribute('fill', tr.f);
  p.setAttribute('stroke', tr.f);
  field.appendChild(p);
  polys.push(p);
}

// Indices (for clarity when crossfading)
const SUN_IDX = [48, 49, 50, 51];
const MOON_IDX = [52, 53, 54, 55, 56, 57, 58, 59];

// ---- Assembly / disperse cycle -------------------------------
// 48 drop-triangles (indices 0-47) cycle between a SCATTERED state
// (random positions all over the canvas, random rotation, smaller
// size) and an ASSEMBLED state (each tri at its SCENE position,
// forming the 6 drops). Loops: scatter → assemble → hold → disperse
// → scatter → repeat. No vertical fall.
const CYCLE = 9000;     // ms, full assemble/disperse loop
const STAGGER = 22;     // ms, per-tri delay so pieces snap at slightly different moments

// Pre-compute per-triangle geometry so the render loop stays cheap.
const ASSEMBLY_CENTROID = new Array(48);  // [cx, cy] of the SCENE triangle
const LOCAL_SHAPE       = new Array(48);  // 3 verts relative to centroid (rotation pivot)
const SCATTER_CENTROID  = new Array(48);  // [cx, cy] scattered position
const SCATTER_ROT       = new Array(48);  // random rotation radians (scattered state)

// Simple deterministic hash → 0..1. Used as a "seeded" random.
function hash01(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

for (let i = 0; i < 48; i++) {
  const tr = SCENE[i];
  const cx = (tr.p[0][0] + tr.p[1][0] + tr.p[2][0]) / 3;
  const cy = (tr.p[0][1] + tr.p[1][1] + tr.p[2][1]) / 3;
  ASSEMBLY_CENTROID[i] = [cx, cy];
  LOCAL_SHAPE[i] = [
    [tr.p[0][0] - cx, tr.p[0][1] - cy],
    [tr.p[1][0] - cx, tr.p[1][1] - cy],
    [tr.p[2][0] - cx, tr.p[2][1] - cy]
  ];
  // Scatter: pseudo-random position inside the viewBox (with a small margin)
  SCATTER_CENTROID[i] = [
    12 + hash01(i * 2)     * 136,   // x: 12..148
    15 + hash01(i * 2 + 1) * 150    // y: 15..165
  ];
  SCATTER_ROT[i] = hash01(i * 2 + 500) * Math.PI * 2;
}

// assembleFactor: 0 = fully scattered, 1 = fully assembled as drops.
// Timeline (with per-tri stagger so pieces snap in at slightly different times):
//   0.00–0.25  scatter → assemble (0 → 1, eased)
//   0.25–0.55  hold assembled (1)
//   0.55–0.80  assemble → scatter (1 → 0, eased)
//   0.80–1.00  hold scattered (0)
function assembleFactor(now, triIdx) {
  const t0 = now - triIdx * STAGGER;
  const phase = ((t0 % CYCLE) + CYCLE) % CYCLE / CYCLE;
  if (phase < 0.25) return smoothstep(0, 1, phase / 0.25);
  if (phase < 0.55) return 1;
  if (phase < 0.80) return 1 - smoothstep(0, 1, (phase - 0.55) / 0.25);
  return 0;
}

// ---- Day/night cycle -----------------------------------------
// Plateau function: stable day → quick sunset → stable night → quick sunrise → loop.
// dayFactor: 0 = full day, 1 = full night.
const PERIOD = 16000; // ms (one full cycle)
function dayNightFactor(phase) {
  if (phase < 0.38) return 0;                        // stable day
  if (phase < 0.50) return smoothstep(0.38, 0.50, phase); // sunset
  if (phase < 0.88) return 1;                        // stable night
  return 1 - smoothstep(0.88, 1.00, phase);          // sunrise
}

// ---- Theme application ---------------------------------------
const rootStyle = document.documentElement.style;
function applyTheme(dayFactor) {
  // Interpolate each CSS variable between DAY and NIGHT themes
  rootStyle.setProperty('--bg',             lerpHex(DAY.bg,            NIGHT.bg,            dayFactor));
  rootStyle.setProperty('--halo',           lerpRgba(DAY.halo,         NIGHT.halo,          dayFactor));
  rootStyle.setProperty('--text-primary',   lerpHex(DAY.textPrimary,   NIGHT.textPrimary,   dayFactor));
  rootStyle.setProperty('--text-secondary', lerpHex(DAY.textSecondary, NIGHT.textSecondary, dayFactor));
  rootStyle.setProperty('--panel-bg',       lerpRgba(DAY.panelBg,      NIGHT.panelBg,       dayFactor));
  rootStyle.setProperty('--panel-border',   lerpRgba(DAY.panelBorder,  NIGHT.panelBorder,   dayFactor));
  rootStyle.setProperty('--accent',         lerpHex(DAY.accent,        NIGHT.accent,        dayFactor));
}

// ---- Render loop ---------------------------------------------
function renderLoop(now) {
  const phase = (now % PERIOD) / PERIOD;
  const dayFactor = dayNightFactor(phase);

  // Sun fades out as we leave day, Moon fades in as we enter night.
  // Short crossfade windows so each celestial body reads clearly during its plateau.
  const sunOpacity  = 1 - smoothstep(0.20, 0.55, dayFactor);
  const moonOpacity = smoothstep(0.45, 0.80, dayFactor);

  for (const i of SUN_IDX)  polys[i].setAttribute('opacity', sunOpacity.toFixed(3));
  for (const i of MOON_IDX) polys[i].setAttribute('opacity', moonOpacity.toFixed(3));

  // Render every triangle.
  //   tris 0-47 (drops): assembly/disperse cycle. They move from
  //     random scattered positions to their assembled drop shape and
  //     back. Plus a subtle wobble on top for constant life.
  //   tris 48-59 (sun + moon): just wobble in place.
  const tm = now / 1000;
  for (let i = 0; i < N; i++) {
    const tr = SCENE[i];
    const ph = i * 0.23;
    let dx = Math.sin(tm * 0.55 + ph)       * 0.35;
    let dy = Math.cos(tm * 0.42 + ph * 1.3) * 0.28;

    if (i < 48) {
      // Assembly cycle: interpolate centroid, rotation and scale
      // between the scattered state (t=0) and the assembled state (t=1).
      const t = assembleFactor(now, i);
      const [acx, acy] = ASSEMBLY_CENTROID[i];
      const [scx, scy] = SCATTER_CENTROID[i];
      const cx = lerp(scx, acx, t);
      const cy = lerp(scy, acy, t);
      const rot = lerp(SCATTER_ROT[i], 0, t);   // rotates to 0 when assembled
      const scl = lerp(0.75, 1, t);             // slightly smaller when scattered
      const cosR = Math.cos(rot), sinR = Math.sin(rot);

      const ls = LOCAL_SHAPE[i];
      // Rotate + scale + translate each of the 3 local vertices
      const x1 = cx + (ls[0][0] * cosR - ls[0][1] * sinR) * scl + dx;
      const y1 = cy + (ls[0][0] * sinR + ls[0][1] * cosR) * scl + dy;
      const x2 = cx + (ls[1][0] * cosR - ls[1][1] * sinR) * scl + dx;
      const y2 = cy + (ls[1][0] * sinR + ls[1][1] * cosR) * scl + dy;
      const x3 = cx + (ls[2][0] * cosR - ls[2][1] * sinR) * scl + dx;
      const y3 = cy + (ls[2][0] * sinR + ls[2][1] * cosR) * scl + dy;

      polys[i].setAttribute('points',
        `${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x3.toFixed(2)},${y3.toFixed(2)}`);
    } else {
      // Sun / moon — wobble only
      polys[i].setAttribute('points',
        `${(tr.p[0][0] + dx).toFixed(2)},${(tr.p[0][1] + dy).toFixed(2)} ` +
        `${(tr.p[1][0] + dx).toFixed(2)},${(tr.p[1][1] + dy).toFixed(2)} ` +
        `${(tr.p[2][0] + dx).toFixed(2)},${(tr.p[2][1] + dy).toFixed(2)}`);
    }
  }

  // Page background + text colours track the cycle
  applyTheme(dayFactor);

  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);
