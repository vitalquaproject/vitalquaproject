// =========================================================
// ETAP Kenya — low-poly morphing scenes
// Inspired by Bryan James' "Species In Pieces" (2015)
//
// - 60 triangles, SAME identity across all 8 scenes
// - Wildly variable sizes, any rotation, free placement
// - Palette per scene designed to READ against the light
//   page background (no framed box, no scene background)
// - Triangles are zoned by viewBox Y so each one stays
//   within a ~25-unit band between scenes → smooth morph:
//     0–11   (12) atmosphere / upper elements (y 0–30)
//     12–29  (18) hero upper / mid-upper      (y 20–55)
//     30–47  (18) hero lower / mid-lower      (y 45–75)
//     48–59  (12) ground / horizon            (y 65–90)
// - On scene change: all 60 tweens run concurrently with
//   staggered start per index (in-pieces-style sweep).
// =========================================================

const N = 60;
const SVG_NS = 'http://www.w3.org/2000/svg';
const DUR = 1000;     // ms tween per triangle
const STAGGER = 10;   // ms per index (total sweep ≈ 1.6 s)

// ---- Per-scene page tint (bg + halo + text) ----
const THEME = [
  // 0 Intro — neutral light
  { bg: '#F8FAFC', halo: 'rgba(248, 250, 252, 0.95)',
    textPrimary: '#0F172A', textSecondary: '#334155', textLabel: '#94A3B8',
    panel: 'rgba(248, 250, 252, 0.82)' },

  // 1 Night Mode — deep navy; light text
  { bg: '#12213D', halo: 'rgba(18, 33, 61, 0.95)',
    textPrimary: '#F4F6FA', textSecondary: '#BBC8DC', textLabel: '#7D8BA8',
    panel: 'rgba(30, 47, 78, 0.55)' },

  // 2–8 share the warm "daytime plant" theme (all show the same master
  // composition, only the camera zooms to a different piece)
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' },
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' },
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' },
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' },
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' },
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' },
  { bg: '#FCE7B9', halo: 'rgba(252, 231, 185, 0.95)',
    textPrimary: '#1F1910', textSecondary: '#4A3A22', textLabel: '#8A7550',
    panel: 'rgba(252, 231, 185, 0.82)' }
];

// ---- ViewBox zoom per scene ----
// Each entry: [x, y, w, h] — the region of the SVG coordinate space to display.
// Slides 0/1 (intro, night) stay at the full viewBox. Slides 2–8 zoom to the
// piece each slide is about; the animation between slides passes through FULL
// so the viewer always sees the whole plant at the mid-point.
const FULL_VB = [0, 0, 160, 180];
const ZOOMS = [
  FULL_VB,                    // 0 Intro   — no zoom
  FULL_VB,                    // 1 Night   — no zoom
  [   0,   2,  60,  82 ],     // 2 Solar   — sun + panel + lake + rising pipe
  [  36,  22,  30,  56 ],     // 3 Buffer  — tank (centre-left)
  [  58,  30,  30,  48 ],     // 4 Cascade
  [  78,  38,  26,  38 ],     // 5 Settling
  [  94,  32,  26,  44 ],     // 6 URF
  [ 114,  32,  26,  44 ],     // 7 Sand
  [ 130,  36,  32,  42 ]      // 8 Biochar + delivery (right)
];

const DUR_ZOOM = 1500;   // ms — total length of the two-phase zoom animation

// ---- Indicator logic ----
const etapLogic = {
  0: { turb: 100, gas: 100, path: 100, org: 100 }, // Intro
  1: { turb: 100, gas: 100, path: 100, org: 100 }, // Night Mode
  2: { turb: 100, gas: 100, path: 100, org: 100 }, // Solar Pumping
  3: { turb: 100, gas: 100, path: 100, org: 100 }, // Buffer Tank
  4: { turb: 100, gas: 10,  path: 100, org: 100 }, // Cascade Aeration
  5: { turb: 20,  gas: 10,  path: 100, org: 100 }, // Settling Tank
  6: { turb: 0,   gas: 5,   path: 90,  org: 100 }, // Roughing Filter (URF)
  7: { turb: 0,   gas: 0,   path: 0,   org: 80  }, // Slow Sand Filter
  8: { turb: 0,   gas: 0,   path: 0,   org: 0   }  // Biochar Polishing
};

// ---- DOM refs ----
const turbEl = document.getElementById('val-turb');
const gasEl  = document.getElementById('val-gas');
const pathEl = document.getElementById('val-path');
const orgEl  = document.getElementById('val-org');
const steps  = document.querySelectorAll('.step');
const field  = document.getElementById('tri-field');
const svgEl  = document.getElementById('scene');

// Current displayed viewBox (starts at full); updated every frame during zoom
let currentZoom = FULL_VB.slice();

// Build polygons once
const polys = [];
for (let i = 0; i < N; i++) {
  const p = document.createElementNS(SVG_NS, 'polygon');
  p.setAttribute('class', 'tri');
  p.setAttribute('points', '0,0 0,0 0,0');
  p.setAttribute('fill', '#000');
  p.setAttribute('stroke', '#000');
  field.appendChild(p);
  polys.push(p);
}

// Compact constructor
const T = (x1, y1, x2, y2, x3, y3, f) => ({
  p: [[x1, y1], [x2, y2], [x3, y3]],
  f
});

// =========================================================
// SCENE 0 — Intro / Presentation
// Decorative floating water drops.  Each drop = 8 triangles:
//   2 upper forming the tip + 6 lower fanning a half-octagon.
// Right side uses lighter cyan, left side darker, 4-tone gradient.
// =========================================================
function sceneIntro() {
  const C1 = '#B8E4EE';  // highlight
  const C2 = '#7ACAE0';  // lit face
  const C3 = '#4FB3D9';  // transition
  const C4 = '#2A85B3';  // shadow
  const HI = '#C4E8F0';  // sparkle

  const drop = (cx, cy, R, H) => {
    const p1x = cx + 0.866 * R, p1y = cy + 0.5   * R;
    const p2x = cx + 0.5   * R, p2y = cy + 0.866 * R;
    const p3x = cx,             p3y = cy + R;
    const p4x = cx - 0.5   * R, p4y = cy + 0.866 * R;
    const p5x = cx - 0.866 * R, p5y = cy + 0.5   * R;
    return [
      T(cx, cy - H,  cx - R, cy,  cx, cy,       C3),
      T(cx, cy - H,  cx, cy,      cx + R, cy,   C1),
      T(cx, cy,  cx + R, cy,  p1x, p1y,         C1),
      T(cx, cy,  p1x, p1y,    p2x, p2y,         C2),
      T(cx, cy,  p2x, p2y,    p3x, p3y,         C2),
      T(cx, cy,  p3x, p3y,    p4x, p4y,         C3),
      T(cx, cy,  p4x, p4y,    p5x, p5y,         C4),
      T(cx, cy,  p5x, p5y,    cx - R, cy,       C4)
    ];
  };

  const sparkle = (cx, cy, s, color = HI) =>
    T(cx, cy - s,  cx - s * 0.75, cy + s * 0.6,  cx + s * 0.75, cy + s * 0.6,  color);

  return [
    // 0–7 UPPER: TINY drop
    ...drop(25, 25, 4, 6),
    // 8–11 UPPER sparkles
    sparkle( 80, 12, 1.5),
    sparkle(110, 28, 2.5),
    sparkle(150, 38, 1.0),
    sparkle( 55, 18, 2.2),

    // 12–19 MID-UPPER: SMALL drop
    ...drop(62, 50, 6, 10),
    // 20–27 MID-UPPER: MEDIUM drop
    ...drop(128, 62, 9, 14),
    // 28–29 sparkles
    sparkle( 14, 72, 2.0),
    sparkle(152, 88, 1.6),

    // 30–37 MID-LOWER: HUGE hero drop
    ...drop(90, 100, 16, 26),
    // 38–45 MID-LOWER: LARGE drop
    ...drop(28, 132, 12, 19),
    // 46–47 sparkles
    sparkle( 55, 128, 1.0),
    sparkle(148,  95, 1.5),

    // 48–55 LOWER: TINY drop
    ...drop(142, 158, 4, 6),
    // 56–59 sparkles
    sparkle( 68, 162, 2.2),
    sparkle(102, 170, 1.3),
    sparkle( 85, 142, 1.0),
    sparkle(120, 152, 2.6)
  ];
}

// =========================================================
// SCENE 1 — Night Mode
// Wider crescent moon (outer circle r=14, inner shifted -8 so the
// lit sliver is chunky), a few stars in the upper sky, distant
// mountain silhouettes behind the ground, and a dim dark ground
// strip positioned within the scene zone (upper half of the page).
// Two small decorative drops + sparkles are scattered in the lower
// portion of the page for ambient movement.
// =========================================================
function sceneNight() {
  // Moon stays bright (hero element) against the deep navy bg
  const MOON_BRIGHT = '#F4E8C0';
  const MOON_MID    = '#E8DCB0';
  const MOON_DIM    = '#D9C99A';
  const MOON_DIMMER = '#C9B88A';
  const STAR        = '#F4F6FA';   // bright (near white)
  const STAR_DIM    = '#BBC8DC';
  // Mountains: darker than the #12213D bg so they silhouette subtly.
  // Narrow tonal range → they "pile up" as a cluster, not as four
  // distinct peaks stretched across the canvas.
  const MT_BACK  = '#0A1528';
  const MT_MID   = '#0F1C33';
  const MT_FRONT = '#14223D';
  // Hill layers — 3-tone dark range, organic dunes
  const H_BACK   = '#0E1A30';
  const H_MID    = '#13203A';
  const H_FRONT  = '#192740';
  const ROCK     = '#091322';
  // Night-water cyan drops — brighter so they pop against the dark bg
  const DR1 = '#7FAECF';
  const DR2 = '#5A8EB3';
  const DR3 = '#3D6E96';
  const DR4 = '#254F74';
  const SPK = '#BCCBDB';

  // Sampled at θ = ±75°, ±37.5°, 0°. Outer circle c=(110,25) r=14,
  // inner circle c=(102,25) r=14 → 8 unit offset → chunky crescent.
  // 4 quads × 2 triangles = 8 tris total, cel-shaded.
  const drop = (cx, cy, R, H) => {
    const p1x = cx + 0.866 * R, p1y = cy + 0.5   * R;
    const p2x = cx + 0.5   * R, p2y = cy + 0.866 * R;
    const p3x = cx,             p3y = cy + R;
    const p4x = cx - 0.5   * R, p4y = cy + 0.866 * R;
    const p5x = cx - 0.866 * R, p5y = cy + 0.5   * R;
    return [
      T(cx, cy - H,  cx - R, cy,  cx, cy,       DR3),
      T(cx, cy - H,  cx, cy,      cx + R, cy,   DR1),
      T(cx, cy,  cx + R, cy,  p1x, p1y,         DR1),
      T(cx, cy,  p1x, p1y,    p2x, p2y,         DR2),
      T(cx, cy,  p2x, p2y,    p3x, p3y,         DR2),
      T(cx, cy,  p3x, p3y,    p4x, p4y,         DR3),
      T(cx, cy,  p4x, p4y,    p5x, p5y,         DR4),
      T(cx, cy,  p5x, p5y,    cx - R, cy,       DR4)
    ];
  };

  const sparkle = (cx, cy, s, color = SPK) =>
    T(cx, cy - s,  cx - s * 0.75, cy + s * 0.6,  cx + s * 0.75, cy + s * 0.6,  color);

  return [
    // ---- 0–7 CRESCENT MOON (wider) at virtual outer-centre (110,25) ----
    // Top horn (θ -75 to -37.5)
    T(114, 12,  121, 17,  113, 17, MOON_DIM),
    T(114, 12,  113, 17,  106, 12, MOON_DIMMER),
    // Upper belly (θ -37.5 to 0)
    T(121, 17,  124, 25,  116, 25, MOON_BRIGHT),
    T(121, 17,  116, 25,  113, 17, MOON_MID),
    // Lower belly (θ 0 to 37.5)
    T(124, 25,  121, 33,  113, 33, MOON_BRIGHT),
    T(124, 25,  113, 33,  116, 25, MOON_MID),
    // Bottom horn (θ 37.5 to 75)
    T(121, 33,  114, 38,  106, 38, MOON_DIM),
    T(121, 33,  106, 38,  113, 33, MOON_DIMMER),

    // ---- 8–11 STARS (tiny, in upper sky) ----
    T( 20, 16,   22, 19,   18, 19, STAR),
    T( 60,  8,   62, 11,   58, 11, STAR_DIM),
    T( 85, 22,   87, 24,   83, 24, STAR),
    T(148, 40,  150, 42,  146, 42, STAR_DIM),

    // ---- 12–15 MOUNTAINS — clustered cluster in x 20–120, overlapping peaks ----
    T( 20, 62,   55, 44,   90, 62, MT_BACK),   // back tall peak
    T(  8, 62,   38, 50,   68, 62, MT_MID),    // left peak, overlaps back
    T( 70, 62,  100, 46,  128, 62, MT_MID),    // right peak, overlaps back
    T( 52, 62,   82, 52,  112, 62, MT_FRONT),  // front peak, overlaps both

    // ---- 16–27 GROUND — 3 layers of organic dunes (no rectangle) ----
    // Back layer (4 big dune silhouettes, darkest)
    T(  0, 84,   22, 66,   50, 84, H_BACK),
    T( 30, 84,   60, 62,   94, 84, H_BACK),
    T( 80, 84,  108, 68,  138, 84, H_BACK),
    T(124, 84,  148, 70,  160, 84, H_BACK),
    // Mid layer (4 medium dunes, slightly lighter)
    T(  0, 86,   14, 76,   34, 86, H_MID),
    T( 42, 86,   62, 74,   86, 86, H_MID),
    T( 82, 86,  104, 78,  126, 86, H_MID),
    T(126, 86,  142, 80,  160, 86, H_MID),
    // Front layer (4 small mounds, lightest of the ground trio)
    T( 10, 88,   18, 82,   28, 88, H_FRONT),
    T( 54, 88,   64, 82,   78, 88, H_FRONT),
    T( 96, 88,  108, 84,  120, 88, H_FRONT),
    T(138, 88,  148, 84,  158, 88, H_FRONT),

    // ---- 28–29 tiny rocks (darkest accents) ----
    T( 36, 87,   42, 83,   48, 87, ROCK),
    T(116, 87,  122, 83,  128, 87, ROCK),

    // ---- 30–37 DECOR DROP 1 (small, lower-left for ambient movement) ----
    ...drop(22, 112, 5, 8),

    // ---- 38–47 SPARKLES scattered mid-lower ----
    sparkle( 60, 100, 1.4),
    sparkle( 95, 115, 2.0),
    sparkle(125, 108, 1.5),
    sparkle(150, 122, 1.2),
    sparkle( 42, 132, 1.8),
    sparkle( 80, 128, 1.0),
    sparkle(110, 130, 1.6),
    sparkle(145, 135, 1.3),
    sparkle( 70, 120, 1.0),
    sparkle(130, 98,  1.4),

    // ---- 48–55 DECOR DROP 2 (small, lower-right) ----
    ...drop(135, 152, 6, 10),

    // ---- 56–59 SPARKLES lower ----
    sparkle( 25, 158, 1.6),
    sparkle( 65, 168, 2.0),
    sparkle( 95, 172, 1.2),
    sparkle(160, 170, 1.5)
  ];
}


// =========================================================
// MASTER PLANT COMPOSITION — shared by scenes 2–8
// The camera (viewBox) zooms in on a different piece per slide, but the
// underlying 60 triangles are the same.
//
// NEW layout (user feedback: replaced well with LAKE, removed mountains,
// added visible PIPES and two animated water droplets flowing through them):
//
//   0–3   Sun (4)               4–7   Solar panel (4)
//   8–13  Lake (6)              14–19 Pipes (6)
//   20–27 Ground dunes (8)      28–29 Flowing droplets (2, animated)
//   30–37 Buffer tank (8)       38–42 Cascade (5)
//   43–47 Settling tank (5)     48–51 URF (4)
//   52–55 Sand filter (4)       56–59 Biochar + delivery (4)
// =========================================================
function plantMaster() {
  // Sun
  const SUN_HI = '#FFE066', SUN_MED = '#FFD34E', SUN_LO = '#FFBF3A';
  // Solar panel
  const PANEL_HI = '#5C93D1', PANEL_MID = '#2D5B9C', PANEL_LO = '#1E3F7A';
  const PANEL_STAND = '#4A5968';
  // Lake
  const LAKE_HI  = '#A3D0E3';   // surface glint
  const LAKE_MED = '#7FB5CC';   // surface water
  const LAKE_LO  = '#5A8EB3';   // mid water
  const LAKE_DK  = '#3D6E96';   // deep water / pump silhouette
  const REED     = '#6BA368';   // green reed on shore
  // Pipes (metal)
  const PIPE = '#8A9098';
  // Flowing droplets
  const DROP_IN  = '#8B5A2B';   // 28 — raw water travelling from lake to tank
  const DROP_OUT = '#7FD8E8';   // 29 — clean water travelling between later stages
  // Ground dunes (warm earth)
  const G_BACK = '#8A6A48', G_MID = '#A8886B', G_FRONT = '#C4A88A';
  // Buffer tank
  const TANK_HI = '#D5DBE1', TANK_LO = '#8A9298';
  const TANK_WATER = '#8B5A2B', TANK_WATER_DK = '#5C3A1E';
  const ANTENNA = '#3E4952';
  // Cascade
  const STEP_STONE = '#A39580';
  const CASC_WATER = '#A0693A';
  const GAS = '#B8C0C4';
  // Settling
  const SETTLE_SHELL = '#76665A';
  const SETTLE_WATER = '#C4A88A';
  const SETTLE_SLOPE = '#5C3A1E';
  const SETTLE_MUD   = '#3E2514';
  // URF
  const URF_SHELL = '#9A9A86';
  const URF_FINE  = '#C9B88A';
  const URF_COARSE = '#5E4538';
  // Sand
  const SAND_SHELL = '#9A9A86';
  const SCHMUTZ    = '#4F9A42';
  const SAND_BED   = '#E4D6A7';
  // Biochar
  const BIOCHAR = '#1C1C1C', BIOCHAR_DK = '#0E0E0E';
  const CLEAN = '#7FD8E8';
  const CUP = '#E2E8F0';

  return [
    // ---- 0–3 SUN (4 wedges from centre (13, 13), diamond shape) ----
    T(13, 13,  19, 13,  13,  7, SUN_HI),   // top-right
    T(13, 13,  13,  7,   7, 13, SUN_HI),   // top-left
    T(13, 13,   7, 13,  13, 19, SUN_LO),   // bottom-left (shadow)
    T(13, 13,  13, 19,  19, 13, SUN_MED),  // bottom-right

    // ---- 4–7 SOLAR PANEL (tilted parallelogram + reflective highlight + stand) ----
    T( 4, 34,  22, 26,  24, 36, PANEL_LO),   // upper half of panel face (dark)
    T( 4, 34,  24, 36,   6, 44, PANEL_MID),  // lower half (medium)
    T( 8, 32,  18, 28,  12, 34, PANEL_HI),   // reflective highlight stripe
    T(11, 44,  15, 44,  13, 66, PANEL_STAND),// long narrow stand going down to lake shore

    // ---- 8–13 LAKE (water body + surface glint + depth + submerged pump + reed) ----
    T(28, 66,  56, 66,  28, 78, LAKE_MED),   // lake surface, upper half
    T(56, 66,  56, 78,  28, 78, LAKE_LO),    // lake lower half
    T(30, 66,  42, 66,  36, 69, LAKE_HI),    // surface glint (lighter patch)
    T(32, 73,  52, 73,  42, 78, LAKE_DK),    // darker depth band
    T(37, 72,  43, 72,  40, 77, LAKE_DK),    // submerged pump silhouette (dark tri inside)
    T(26, 70,  30, 66,  30, 72, REED),       // shore reed / bank accent

    // ---- 14–19 PIPES (thin triangles running between elements) ----
    T(46, 66,  50, 30,  48, 50, PIPE),       // lake → tank (long rising diagonal)
    T(58, 44,  66, 42,  62, 45, PIPE),       // tank → cascade (short)
    T(82, 66,  86, 46,  84, 56, PIPE),       // cascade → settling (rising)
    T(98, 50, 102, 42, 100, 46, PIPE),       // settling → URF (short diagonal)
    T(114, 42, 118, 42, 116, 44, PIPE),      // URF → sand (very short)
    T(132, 50, 134, 50, 133, 52, PIPE),      // sand → biochar (very short)

    // ---- 20–27 GROUND DUNES (simplified, 3 layers, no mountains) ----
    T(  0, 82,   40, 74,   80, 82, G_BACK),
    T( 60, 82,  100, 72,  140, 82, G_BACK),
    T(120, 82,  160, 76,  160, 82, G_BACK),
    T(  0, 85,   30, 80,   60, 85, G_MID),
    T( 50, 85,   90, 79,  120, 85, G_MID),
    T(110, 85,  140, 81,  160, 85, G_MID),
    T( 20, 88,   40, 86,   60, 88, G_FRONT),
    T(110, 88,  130, 86,  150, 88, G_FRONT),

    // ---- 28–29 FLOWING DROPLETS (overridden every frame while on plant scenes) ----
    T(46, 64.8,  44.8, 66.84,  47.2, 66.84, DROP_IN),   // path: lake → tank
    T(82, 64.8,  80.8, 66.84,  83.2, 66.84, DROP_OUT),  // path: cascade → settling

    // ---- 30–37 BUFFER TANK (tall cylinder + water cutaway + antenna) ----
    T(42, 30,  58, 30,  42, 50, TANK_HI),        // upper-left half
    T(58, 30,  58, 50,  42, 50, TANK_LO),        // upper-right half
    T(42, 50,  58, 50,  42, 70, TANK_HI),        // lower-left half
    T(58, 50,  58, 70,  42, 70, TANK_LO),        // lower-right half
    T(44, 36,  56, 36,  44, 46, TANK_WATER),     // water surface
    T(56, 36,  56, 46,  44, 46, TANK_WATER_DK),  // water surface shade
    T(44, 46,  56, 46,  50, 68, TANK_WATER_DK),  // deeper water mass
    T(49, 26,  51, 26,  50, 30, ANTENNA),        // antenna tip

    // ---- 38–42 CASCADE (3 step platforms + falling water + gas bubble) ----
    T(66, 42,  78, 42,  66, 48, STEP_STONE),
    T(68, 52,  80, 52,  68, 58, STEP_STONE),
    T(70, 62,  82, 62,  70, 68, STEP_STONE),
    T(76, 48,  78, 54,  70, 54, CASC_WATER),   // falling water between step 1 and 2
    T(72, 34,  75, 30,  78, 36, GAS),           // rising gas bubble

    // ---- 43–47 SETTLING TANK (wide, sloped floor, mud pile) ----
    T(84, 46,  98, 46,  84, 64, SETTLE_SHELL),
    T(98, 46,  98, 64,  84, 64, SETTLE_SHELL),
    T(86, 50,  96, 50,  90, 56, SETTLE_WATER),   // clarified water
    T(86, 62,  96, 54,  96, 62, SETTLE_SLOPE),   // diagonal sloped floor
    T(90, 62,  96, 58,  96, 64, SETTLE_MUD),     // sludge pile

    // ---- 48–51 URF (vessel shell + 2 gravel bands) ----
    T(100, 40, 114, 40, 100, 64, URF_SHELL),
    T(114, 40, 114, 64, 100, 64, URF_SHELL),
    T(102, 46, 112, 46, 107, 52, URF_FINE),
    T(102, 56, 112, 56, 107, 62, URF_COARSE),

    // ---- 52–55 SAND FILTER (vessel + Schmutzdecke + sand bed) ----
    T(118, 40, 132, 40, 118, 64, SAND_SHELL),
    T(132, 40, 132, 64, 118, 64, SAND_SHELL),
    T(120, 46, 130, 46, 125, 48, SCHMUTZ),
    T(120, 50, 130, 50, 125, 60, SAND_BED),

    // ---- 56–59 BIOCHAR COLUMN + DELIVERY ----
    T(134, 42, 146, 42, 134, 64, BIOCHAR),
    T(146, 42, 146, 64, 134, 64, BIOCHAR_DK),
    T(146, 50, 154, 52, 150, 58, CLEAN),       // outlet + arc of clean water
    T(153, 58, 159, 58, 156, 64, CUP)          // delivery cup
  ];
}

// Build the master once and share across slides 2–8
const MASTER = plantMaster();

const SCENES = [
  sceneIntro(), sceneNight(),
  MASTER, MASTER, MASTER, MASTER, MASTER, MASTER, MASTER
];

// Sanity check
SCENES.forEach((s, i) => {
  if (s.length !== N) console.warn(`Scene ${i}: ${s.length} triangles (expected ${N})`);
});

// =========================================================
// Tween engine — JS-driven (CSS can't animate `points`)
// =========================================================
const current = SCENES[0].map(tr => ({
  p: tr.p.map(pt => [pt[0], pt[1]]),
  f: tr.f
}));

// =========================================================
// Perpetual render loop
//   - Runs every frame, always
//   - If a scene transition is active, interpolates points + fill
//   - On top of the base points, adds a subtle idle wobble so
//     triangles feel alive. Amplitude small enough not to break
//     the shape; per-index phase keeps neighbours nearly in sync.
// =========================================================
const tweenState = {
  active: false,
  startTime: 0,
  from: null,
  target: null,
  // ViewBox zoom tween — bi-phase: fromZoom → FULL_VB → targetZoom
  fromZoom: FULL_VB.slice(),
  targetZoom: FULL_VB.slice(),
  zoomStart: 0,        // timestamp when zoom animation began
  zoomActive: false
};

// Active scene index — read by the render loop to decide whether the plant
// droplets (tris 28-29) should be animated along pipe paths.
let activeSceneIdx = 0;

// Pipe-flow paths that the droplets follow while on a plant scene.
// Each entry: {from: [x,y], to: [x,y], period: ms}
// Droplet 28 traces the lake→tank pipe (raw muddy water going up).
// Droplet 29 traces the cascade→settling pipe (water already aerated).
const DROPLET_PATHS = [
  { from: [46, 66], to: [50, 30], period: 2400 },
  { from: [82, 66], to: [86, 46], period: 2000 }
];
const DROPLET_SIZE = 1.4;

function applyScene(idx) {
  const target = SCENES[idx];
  if (!target) return;

  activeSceneIdx = idx;

  tweenState.from = current.map(tr => ({
    p: tr.p.map(pt => [pt[0], pt[1]]),
    f: tr.f
  }));
  tweenState.target = target;
  tweenState.startTime = performance.now();
  tweenState.active = true;

  // Capture the viewBox we're leaving from and the new target zoom.
  tweenState.fromZoom = currentZoom.slice();
  tweenState.targetZoom = (ZOOMS[idx] || FULL_VB).slice();
  tweenState.zoomStart = performance.now();
  tweenState.zoomActive = true;

  // Tint the whole page to match the scene's mood.
  const theme = THEME[idx];
  if (theme) {
    const r = document.documentElement.style;
    r.setProperty('--bg',             theme.bg);
    r.setProperty('--halo',           theme.halo);
    r.setProperty('--text-primary',   theme.textPrimary);
    r.setProperty('--text-secondary', theme.textSecondary);
    r.setProperty('--text-label',     theme.textLabel);
    r.setProperty('--panel-bg',       theme.panel);
  }

  const state = etapLogic[idx];
  if (state) {
    animateValue(turbEl, state.turb, 600);
    animateValue(gasEl,  state.gas,  600);
    animateValue(pathEl, state.path, 600);
    animateValue(orgEl,  state.org,  600);
  }
}

// Interpolate a viewBox rectangle [x, y, w, h]
function lerpRect(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
    lerp(a[3], b[3], t)
  ];
}

function renderLoop(now) {
  // --- 1. Advance the tween (writes into current[])
  if (tweenState.active) {
    let anyGoing = false;
    for (let i = 0; i < N; i++) {
      const delay = i * STAGGER;
      const raw = (now - tweenState.startTime - delay) / DUR;
      const t = Math.max(0, Math.min(1, raw));
      if (raw < 1) anyGoing = true;
      const e = easeInOut(t);
      const a = tweenState.from[i];
      const b = tweenState.target[i];
      current[i].p[0][0] = lerp(a.p[0][0], b.p[0][0], e);
      current[i].p[0][1] = lerp(a.p[0][1], b.p[0][1], e);
      current[i].p[1][0] = lerp(a.p[1][0], b.p[1][0], e);
      current[i].p[1][1] = lerp(a.p[1][1], b.p[1][1], e);
      current[i].p[2][0] = lerp(a.p[2][0], b.p[2][0], e);
      current[i].p[2][1] = lerp(a.p[2][1], b.p[2][1], e);
      current[i].f = lerpHex(a.f, b.f, e);
    }
    if (!anyGoing) tweenState.active = false;
  }

  // --- 2. Animate pipe droplets while on a plant scene
  //    Two tiny triangles (indices 28, 29) traverse pipe paths continuously.
  //    Only active when: scene is plant (2-8) AND the scene-change tween has
  //    finished — we don't want to fight the morph from night into the plant.
  if (activeSceneIdx >= 2 && !tweenState.active) {
    for (let j = 0; j < DROPLET_PATHS.length; j++) {
      const i = 28 + j;
      const path = DROPLET_PATHS[j];
      const t = ((now + j * 700) % path.period) / path.period;
      const cx = lerp(path.from[0], path.to[0], t);
      const cy = lerp(path.from[1], path.to[1], t);
      const s  = DROPLET_SIZE;
      current[i].p[0][0] = cx;        current[i].p[0][1] = cy - s;
      current[i].p[1][0] = cx - s;    current[i].p[1][1] = cy + s * 0.7;
      current[i].p[2][0] = cx + s;    current[i].p[2][1] = cy + s * 0.7;
    }
  }

  // --- 3. Animate viewBox (bi-phase: fromZoom → FULL → targetZoom)
  //    Phase 1 (0–50%): camera pulls back from the previous piece to a
  //    full view of the whole plant. Phase 2 (50–100%): camera dives
  //    into the new piece. Cubic easing on each half gives a natural
  //    slow-down at the midpoint without an explicit pause.
  if (tweenState.zoomActive) {
    const zt = (now - tweenState.zoomStart) / DUR_ZOOM;
    let vb;
    if (zt >= 1) {
      vb = tweenState.targetZoom;
      tweenState.zoomActive = false;
    } else if (zt < 0.5) {
      vb = lerpRect(tweenState.fromZoom, FULL_VB, easeInOut(zt * 2));
    } else {
      vb = lerpRect(FULL_VB, tweenState.targetZoom, easeInOut((zt - 0.5) * 2));
    }
    currentZoom = vb;
    svgEl.setAttribute('viewBox',
      `${vb[0].toFixed(2)} ${vb[1].toFixed(2)} ${vb[2].toFixed(2)} ${vb[3].toFixed(2)}`);
  }

  // --- 4. Render with idle wobble
  const tm = now / 1000;
  for (let i = 0; i < N; i++) {
    const c = current[i];
    // Signed area: twice the triangle area. Skip wobble on collapsed/hidden tris.
    const a2 = Math.abs(
      (c.p[1][0] - c.p[0][0]) * (c.p[2][1] - c.p[0][1]) -
      (c.p[2][0] - c.p[0][0]) * (c.p[1][1] - c.p[0][1])
    );
    let dx = 0, dy = 0;
    if (a2 > 0.5) {
      const phase = i * 0.23;
      dx = Math.sin(tm * 0.55 + phase) * 0.22;
      dy = Math.cos(tm * 0.42 + phase * 1.3) * 0.18;
    }

    polys[i].setAttribute('points',
      `${(c.p[0][0] + dx).toFixed(2)},${(c.p[0][1] + dy).toFixed(2)} ` +
      `${(c.p[1][0] + dx).toFixed(2)},${(c.p[1][1] + dy).toFixed(2)} ` +
      `${(c.p[2][0] + dx).toFixed(2)},${(c.p[2][1] + dy).toFixed(2)}`);
    polys[i].setAttribute('fill', c.f);
    polys[i].setAttribute('stroke', c.f);
  }

  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function lerpHex(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
function parseHex(h) {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function toHex(n) { return n.toString(16).padStart(2,'0'); }

function animateValue(obj, targetValue, duration) {
  const currentValue = parseInt(obj.innerText.replace('%', '')) || 0;
  // Use a class so the CSS var for "primary" text color kicks in on unchanged
  // indicators and adapts to the scene theme (e.g. light text on dark night bg).
  obj.classList.toggle('ind-changed', targetValue < 100);
  if (currentValue === targetValue) return;
  let startTimestamp = null;
  const tick = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const eo = progress * (2 - progress);
    obj.innerHTML = Math.floor(eo * (targetValue - currentValue) + currentValue) + '%';
    if (progress < 1) window.requestAnimationFrame(tick);
    else obj.innerHTML = targetValue + '%';
  };
  window.requestAnimationFrame(tick);
}

// =========================================================
// Scroll observer
// =========================================================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    steps.forEach(s => s.classList.remove('active'));
    entry.target.classList.add('active');
    applyScene(parseInt(entry.target.getAttribute('data-step'), 10));
  });
}, {
  root: document.getElementById('scroll-zone'),
  rootMargin: '-35% 0px -35% 0px',
  threshold: 0
});

steps.forEach(s => observer.observe(s));

// Initial paint
applyScene(0);
