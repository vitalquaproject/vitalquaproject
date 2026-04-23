// =========================================================
// Vitalqua Project — Building / Coming Soon page
// Runs inside the same site shell as the landing (header + footer).
// Drops assemble and disperse as a loop; sun + moon crossfade
// subtly in the sky. No page-wide theme rewrite — the section
// keeps the site's cyan/navy palette throughout.
// =========================================================

const N = 60;
const SVG_NS = 'http://www.w3.org/2000/svg';
const field  = document.getElementById('tri-field');

// ---- Palette (aligned with the site cyan/navy tokens) --------
const D_HI  = '#D6EEF6';   // platform --cy-xlt
const D_LIT = '#A3D0E3';   // --cy-lt
const D_MED = '#4FB3D9';   // --cy
const D_DK  = '#2A85B3';   // --cy-dk

const SUN_HI  = '#FFE066';
const SUN_MED = '#FFD34E';
const SUN_LO  = '#FFBF3A';

const MOON_HI     = '#F4E8C0';
const MOON_MED    = '#E8DCB0';
const MOON_LO     = '#D9C99A';
const MOON_DIMMER = '#C9B88A';

// ---- Helpers ------------------------------------------------
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Compact triangle constructor
const T = (x1, y1, x2, y2, x3, y3, f) => ({
  p: [[x1, y1], [x2, y2], [x3, y3]],
  f
});

// 8-triangle water drop (2 tip triangles + 6 half-octagon fan)
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

// ---- Scene composition (60 triangles) ------------------------
//   6 drops (48 tris) distributed around the section
// + sun (4 tris) on the left
// + moon crescent (8 tris) on the right
const SCENE = [
  ...drop( 22,  30, 5, 8),    //  0–7   small drop top-left
  ...drop(140,  32, 5, 8),    //  8–15  small drop top-right
  ...drop( 18, 102, 9, 14),   // 16–23  medium drop mid-left
  ...drop(144, 108, 8, 13),   // 24–31  medium drop mid-right
  ...drop( 58, 160, 4, 6),    // 32–39  tiny drop lower-left
  ...drop(115, 158, 6, 10),   // 40–47  small drop lower-right

  // Sun (48–51) — 4-wedge diamond at (46, 54)
  T(46, 54,  54, 54,  46, 46, SUN_HI),
  T(46, 54,  46, 46,  38, 54, SUN_HI),
  T(46, 54,  38, 54,  46, 62, SUN_LO),
  T(46, 54,  46, 62,  54, 54, SUN_MED),

  // Moon crescent (52–59) at virtual centre (116, 54), r=8, inner offset -5
  T(118, 46,  122, 49,  117, 49, MOON_LO),
  T(118, 46,  117, 49,  113, 46, MOON_DIMMER),
  T(122, 49,  124, 54,  119, 54, MOON_HI),
  T(122, 49,  119, 54,  117, 49, MOON_MED),
  T(124, 54,  122, 59,  117, 59, MOON_HI),
  T(124, 54,  117, 59,  119, 54, MOON_MED),
  T(122, 59,  118, 62,  113, 62, MOON_LO),
  T(122, 59,  113, 62,  117, 59, MOON_DIMMER)
];

// ---- Build polygon nodes once --------------------------------
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

const SUN_IDX  = [48, 49, 50, 51];
const MOON_IDX = [52, 53, 54, 55, 56, 57, 58, 59];

// ---- Drop assembly/disperse cycle ----------------------------
// Each drop-triangle cycles between scattered and assembled states.
const CYCLE = 9000;
const STAGGER = 22;
const ASSEMBLY_CENTROID = new Array(48);
const LOCAL_SHAPE       = new Array(48);
const SCATTER_CENTROID  = new Array(48);
const SCATTER_ROT       = new Array(48);

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
  SCATTER_CENTROID[i] = [
    12 + hash01(i * 2)     * 136,
    15 + hash01(i * 2 + 1) * 150
  ];
  SCATTER_ROT[i] = hash01(i * 2 + 500) * Math.PI * 2;
}

function assembleFactor(now, triIdx) {
  const t0 = now - triIdx * STAGGER;
  const phase = ((t0 % CYCLE) + CYCLE) % CYCLE / CYCLE;
  if (phase < 0.25) return smoothstep(0, 1, phase / 0.25);
  if (phase < 0.55) return 1;
  if (phase < 0.80) return 1 - smoothstep(0, 1, (phase - 0.55) / 0.25);
  return 0;
}

// ---- Sun / moon gentle crossfade ----------------------------
// Subtle cycle — the sun is mostly visible, the moon appears briefly;
// the page background does NOT swap, so the site palette stays consistent.
const PERIOD = 18000;
function dayNightFactor(phase) {
  if (phase < 0.42) return 0;
  if (phase < 0.50) return smoothstep(0.42, 0.50, phase);
  if (phase < 0.88) return 1;
  return 1 - smoothstep(0.88, 1.00, phase);
}

// ---- Render loop --------------------------------------------
function renderLoop(now) {
  const phase = (now % PERIOD) / PERIOD;
  const dayFactor = dayNightFactor(phase);

  const sunOpacity  = 1 - smoothstep(0.20, 0.55, dayFactor);
  const moonOpacity = smoothstep(0.45, 0.80, dayFactor);
  for (const i of SUN_IDX)  polys[i].setAttribute('opacity', sunOpacity.toFixed(3));
  for (const i of MOON_IDX) polys[i].setAttribute('opacity', moonOpacity.toFixed(3));

  // Drops: cycle between scattered and assembled; sun/moon just wobble.
  const tm = now / 1000;
  for (let i = 0; i < N; i++) {
    const tr = SCENE[i];
    const ph = i * 0.23;
    let dx = Math.sin(tm * 0.55 + ph)       * 0.35;
    let dy = Math.cos(tm * 0.42 + ph * 1.3) * 0.28;

    if (i < 48) {
      const t = assembleFactor(now, i);
      const [acx, acy] = ASSEMBLY_CENTROID[i];
      const [scx, scy] = SCATTER_CENTROID[i];
      const cx = lerp(scx, acx, t);
      const cy = lerp(scy, acy, t);
      const rot = lerp(SCATTER_ROT[i], 0, t);
      const scl = lerp(0.75, 1, t);
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const ls = LOCAL_SHAPE[i];
      const x1 = cx + (ls[0][0] * cosR - ls[0][1] * sinR) * scl + dx;
      const y1 = cy + (ls[0][0] * sinR + ls[0][1] * cosR) * scl + dy;
      const x2 = cx + (ls[1][0] * cosR - ls[1][1] * sinR) * scl + dx;
      const y2 = cy + (ls[1][0] * sinR + ls[1][1] * cosR) * scl + dy;
      const x3 = cx + (ls[2][0] * cosR - ls[2][1] * sinR) * scl + dx;
      const y3 = cy + (ls[2][0] * sinR + ls[2][1] * cosR) * scl + dy;

      polys[i].setAttribute('points',
        `${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x3.toFixed(2)},${y3.toFixed(2)}`);
    } else {
      polys[i].setAttribute('points',
        `${(tr.p[0][0] + dx).toFixed(2)},${(tr.p[0][1] + dy).toFixed(2)} ` +
        `${(tr.p[1][0] + dx).toFixed(2)},${(tr.p[1][1] + dy).toFixed(2)} ` +
        `${(tr.p[2][0] + dx).toFixed(2)},${(tr.p[2][1] + dy).toFixed(2)}`);
    }
  }

  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);

// ---- Fixed header scroll state -----------------------------
(function () {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
