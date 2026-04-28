// =========================================================
// Vitalqua Project — PROCESS page scrollytelling engine
//
// SPECIES-IN-PIECES morph:
//   A fixed set of N = 60 triangles keeps its identity across
//   all 9 scenes. Each scene function returns exactly N tris;
//   between scenes, every triangle animates its 3 vertices AND
//   its colour from the old scene to the new one (staggered
//   start per index so the morph sweeps across the composition
//   rather than popping).
//
// Flow particles (water, bubbles, microbes, drifting sediment)
// ride as a separate per-scene overlay that fades in/out; they
// animate only while their scene is the active one.
// =========================================================

const NS  = 'http://www.w3.org/2000/svg';
const VW  = 160;
const VH  = 100;
const N   = 60;            // fixed triangle budget

const DUR_MORPH  = 1100;   // ms — total morph length
const STAGGER    = 12;     // ms per triangle index

// ---- Palette ------------------------------------------------
const P = {
  wHi:'#D6EEF6', wLt:'#A3D0E3', w:'#4FB3D9', wDk:'#2A85B3', wXdk:'#1B5F85', sea:'#0F3A56',
  navy:'#0F1A2E', ink:'#3F4F6B', mut:'#6B7890', fnt:'#A3B5CD',
  cHi:'#B8B6AE', cMd:'#888780', cDk:'#5F5E5A', cXdk:'#444441', cBlk:'#2C2C2A',
  sHi:'#F0E4BA', sLt:'#E8D8A8', sMd:'#C8A870', sDk:'#B89858',
  mud:'#9B7828', mudDk:'#6B4F10', mudXdk:'#3A1A08',
  grLt:'#6DA843', grMd:'#4A8015', grDk:'#3B6D11', grXdk:'#27500A',
  aHi:'#FFE066', aMd:'#FFD34E', aLo:'#FFBF3A',
  moon:'#F4E8C0', moonDk:'#D9C99A', night:'#12213D', nightDp:'#07101E',
  bg:'#F6F8FB'
};

// ---- Helpers ------------------------------------------------
function T(x1, y1, x2, y2, x3, y3, fill) {
  return { p: [[x1, y1], [x2, y2], [x3, y3]], f: fill };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
function easeOut(t) { return 1 - (1 - t) * (1 - t) * (1 - t); }

// ---- Colour parsing / interpolation -------------------------
function parseColor(str) {
  if (typeof str !== 'string') return [0, 0, 0, 0];
  if (str.startsWith('rgba') || str.startsWith('rgb')) {
    const m = str.match(/rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)(?:,\s*([^)]+))?\s*\)/);
    if (!m) return [0, 0, 0, 0];
    return [
      parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]),
      m[4] ? parseFloat(m[4]) : 1
    ];
  }
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 6) {
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b, 1];
    }
  }
  return [0, 0, 0, 0];
}
function rgbaStr([r, g, b, a]) {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
}
function lerpColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

// ---- Padding: fill short scenes to exactly N triangles ------
// Extras sit as invisible specks in the upper sky — they reappear
// when a later scene gives them a real role (morph from invisible
// to visible is a natural fade-in).
function dummyAt(i) {
  // Deterministic pseudo-random but identical across scenes when
  // same index is used — so "dummy" positions line up and
  // transitions between scenes that both pad keep them still.
  const sx = 80 + ((i * 29) % 160) - 80;      // spread in viewBox x
  const sy = 2 + ((i * 17) % 10);             // near top edge
  return { p: [[sx, sy], [sx + 0.6, sy], [sx + 0.3, sy + 0.6]], f: 'rgba(220,230,240,0)' };
}
function fill60(tris) {
  const out = tris.slice(0, N);
  while (out.length < N) out.push(dummyAt(out.length));
  return out;
}

// =========================================================
// FLOW PARTICLES — per-scene overlay (not part of morph budget)
// =========================================================
function F(path, size, fill, speed, phase = 0) {
  return { type: 'flow', path, size, f: fill, speed, phase };
}
function B(x, yTop, yBot, size, fill, speed, phase = 0) {
  return { type: 'bubble', x, yTop, yBot, size, f: fill, speed, phase };
}
function D(xMin, xMax, yTop, yBot, size, fill, speed, phase = 0) {
  return { type: 'drift', xMin, xMax, yTop, yBot, size, f: fill, speed, phase };
}
function Pu(x, y, size, fill, speed, phase = 0) {
  return { type: 'pulse', x, y, size, f: fill, speed, phase };
}

function samplePath(path, t) {
  if (path.length < 2) return path[0] || [0, 0];
  const lens = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i+1][0] - path[i][0];
    const dy = path[i+1][1] - path[i][1];
    const L = Math.hypot(dx, dy);
    lens.push(L); total += L;
  }
  let target = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const u = lens[i] > 0 ? target / lens[i] : 0;
      return [lerp(path[i][0], path[i+1][0], u), lerp(path[i][1], path[i+1][1], u)];
    }
    target -= lens[i];
  }
  return path[path.length - 1];
}
function triAt(cx, cy, size, rot = 0) {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const a = rot + (Math.PI / 2) + (i * 2 * Math.PI / 3);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

// =========================================================
// SCENE BUILDERS — each returns { tris: [...60], parts: [...] }
// =========================================================

// ---- 0: INTRO ------------------------------------------------
function scene0() {
  const tris = [];
  const parts = [];
  const cx = 80, cy = 48, R = 18, H = 26;
  // [0-7] 8 sun rays behind
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tx = cx + Math.sin(a) * 34;
    const ty = cy - Math.cos(a) * 34;
    const bx1 = cx + Math.sin(a - 0.06) * 23;
    const by1 = cy - Math.cos(a - 0.06) * 23;
    const bx2 = cx + Math.sin(a + 0.06) * 23;
    const by2 = cy - Math.cos(a + 0.06) * 23;
    tris.push(T(tx, ty, bx1, by1, bx2, by2, P.aMd));
  }
  // [8-9] drop tip
  tris.push(T(cx, cy - H, cx - R, cy, cx, cy, P.w));
  tris.push(T(cx, cy - H, cx, cy, cx + R, cy, P.wHi));
  // [10-15] drop fan (6)
  const cols = [P.wHi, P.wLt, P.w, P.w, P.wDk, P.wDk];
  for (let i = 0; i < 6; i++) {
    const a1 = (i / 6) * Math.PI;
    const a2 = ((i + 1) / 6) * Math.PI;
    tris.push(T(cx, cy,
      cx + R * Math.cos(a1), cy + R * Math.sin(a1),
      cx + R * Math.cos(a2), cy + R * Math.sin(a2),
      cols[i]));
  }
  // [16-21] 6 small floating drops at corners only (much less cluttered)
  const corners = [[20, 22],[140, 22],[16, 80],[144, 80],[80, 12],[80, 86]];
  for (let i = 0; i < corners.length; i++) {
    const [fx, fy] = corners[i];
    tris.push(T(fx, fy - 2, fx - 1.4, fy + 1, fx + 1.4, fy + 1, i % 2 ? P.wLt : P.wHi));
  }
  // Particles — 2 gentle orbital drops only (was 5)
  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * Math.PI * 2;
    const path = [];
    for (let k = 0; k <= 24; k++) {
      const ang = a + (k / 24) * Math.PI * 2;
      path.push([cx + 46 * Math.cos(ang), cy + 30 * Math.sin(ang)]);
    }
    parts.push(F(path, 1.0, P.wLt, 0.04, i * 0.5));
  }
  return { tris: fill60(tris), parts };
}

// ---- 1: NIGHT MODE ------------------------------------------
function scene1() {
  const tris = [];
  const parts = [];
  // [0-3] mountains
  tris.push(T(0, 72, 28, 58, 48, 70, P.sea));
  tris.push(T(48, 70, 68, 62, 92, 72, P.sea));
  tris.push(T(92, 72, 118, 60, 160, 72, P.sea));
  tris.push(T(0, 68, 40, 64, 20, 72, P.wXdk));
  // [4-7] dunes / ground
  tris.push(T(0, 72, 160, 70, 160, 88, P.navy));
  tris.push(T(0, 72, 160, 88, 0, 88, P.navy));
  tris.push(T(0, 80, 84, 76, 68, 100, P.nightDp));
  tris.push(T(68, 100, 84, 76, 160, 100, P.nightDp));
  // [8-11] moon (diamond, 4 tris)
  const mx = 118, my = 28, mr = 9;
  tris.push(T(mx, my, mx + mr, my, mx, my - mr, P.moon));
  tris.push(T(mx, my, mx + mr, my, mx, my + mr, P.moonDk));
  tris.push(T(mx, my, mx, my + mr, mx - mr, my, P.moon));
  tris.push(T(mx, my, mx - mr, my, mx, my - mr, P.moonDk));
  // [12-27] 16 stars (tiny tri each)
  const stars = [
    [14, 12],[28, 8],[42, 16],[56, 10],[72, 14],[84, 6],[100, 18],[136, 10],
    [148, 22],[26, 28],[44, 34],[10, 40],[146, 38],[78, 30],[62, 24],[96, 34]
  ];
  for (const [sx, sy] of stars) {
    tris.push(T(sx, sy - 1.1, sx - 0.9, sy + 0.7, sx + 0.9, sy + 0.7, '#E8E0B8'));
  }
  // [28-59] 32 more stars/distant galaxy specks filling the night sky
  const moreStars = [
    // Mid-height band (brighter)
    [32, 44],[60, 48],[80, 40],[102, 52],[120, 46],[66, 38],[92, 46],[50, 50],
    // Upper sky (tiny/dim)
    [6, 6],[20, 20],[38, 2],[54, 18],[76, 4],[94, 10],[110, 20],[134, 4],
    [6, 30],[18, 44],[4, 52],[154, 30],[152, 50],[142, 18],[134, 40],[110, 40],
    // Far galactic haze bits
    [22, 48],[34, 56],[48, 40],[114, 54],[128, 44],[140, 52],[72, 54],[86, 52]
  ];
  for (let i = 0; i < moreStars.length; i++) {
    const [sx, sy] = moreStars[i];
    const bright = i < 8 ? '#E8E0B8' : i < 20 ? '#C9D3E0' : '#8AA0BA';
    const s = i < 8 ? 0.9 : 0.7;
    tris.push(T(sx, sy - s, sx - s * 0.9, sy + s * 0.7, sx + s * 0.9, sy + s * 0.7, bright));
  }
  // Particles: twinkling stars + gentle moon glow
  parts.push(Pu(28, 8, 1.0, '#F4E8C0', 0.3, 0));
  parts.push(Pu(84, 6, 1.0, '#F4E8C0', 0.25, 0.4));
  parts.push(Pu(136, 10, 1.0, '#F4E8C0', 0.28, 0.2));
  parts.push(Pu(mx, my, 10, 'rgba(244, 232, 192, 0.15)', 0.15, 0));
  return { tris: fill60(tris), parts };
}

// ---- 2: SOLAR PUMPING ---------------------------------------
// Layout: sun top-right · tilted GREY solar panel centre · landscape
// ground · pond bottom-left with submerged pump · bent pipe rising
// toward the next stage (top-right exit).
function scene2() {
  const tris = [];
  const parts = [];

  // Sun top-right — 8 rays + 4 core diamond
  const sx = 132, sy = 20;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tx = sx + Math.sin(a) * 16;
    const ty = sy - Math.cos(a) * 16;
    const bx1 = sx + Math.sin(a - 0.10) * 9;
    const by1 = sy - Math.cos(a - 0.10) * 9;
    const bx2 = sx + Math.sin(a + 0.10) * 9;
    const by2 = sy - Math.cos(a + 0.10) * 9;
    tris.push(T(tx, ty, bx1, by1, bx2, by2, P.aMd));
  }
  const sr = 6;
  tris.push(T(sx, sy, sx + sr, sy, sx, sy - sr, P.aHi));
  tris.push(T(sx, sy, sx + sr, sy, sx, sy + sr, P.aMd));
  tris.push(T(sx, sy, sx, sy + sr, sx - sr, sy, P.aLo));
  tris.push(T(sx, sy, sx - sr, sy, sx, sy - sr, P.aMd));

  // Hill silhouettes (background landscape)
  tris.push(T(0, 74, 44, 60, 78, 76, '#C4D4C0'));
  tris.push(T(78, 76, 114, 66, 160, 76, '#B4C4AC'));

  // Ground band (subtle, warm sand)
  tris.push(T(0, 78, 160, 76, 160, 92, P.sLt));
  tris.push(T(0, 78, 160, 92, 0, 92, P.sMd));

  // Solar panel — tilted parallelogram, GREY cells with slight blue sheen
  // Tilt: right side lower (tipping toward sun on the right)
  const pX = 52, pY = 38, pW = 48, pH = 14, tilt = 4;
  // Backplate (dark navy frame)
  tris.push(T(pX, pY, pX + pW, pY + tilt, pX + pW, pY + pH + tilt, P.navy));
  tris.push(T(pX, pY, pX + pW, pY + pH + tilt, pX, pY + pH, P.ink));
  // 5 cell columns × 2 tris — alternating grey tones (with one cyan-grey tint for subtle blue sheen)
  const cellA = ['#C0BEB4', '#A0A097', '#B8B6AE', '#9B9990', '#AEB8BE'];
  const cellB = ['#888780', '#6E6D68', '#7C7B74', '#5F5E5A', '#7A8890'];
  for (let i = 0; i < 5; i++) {
    const u1 = i / 5, u2 = (i + 1) / 5;
    const x1 = pX + u1 * pW, y1 = pY + u1 * tilt;
    const x2 = pX + u2 * pW, y2 = pY + u2 * tilt;
    tris.push(T(x1, y1, x2, y2, x2, y2 + pH, cellA[i]));
    tris.push(T(x1, y1, x2, y2 + pH, x1, y1 + pH, cellB[i]));
  }

  // Panel mount — vertical post + diagonal brace
  tris.push(T(74, 52 + 1, 78, 52 + 2, 77, 78, P.cXdk));
  tris.push(T(74, 52 + 1, 77, 78, 73, 78, P.cBlk));
  tris.push(T(66, 78, 84, 78, 75, 70, P.cXdk));

  // Pond bottom-left — water surface faceted
  tris.push(T(6, 80, 38, 78, 42, 84, P.w));
  tris.push(T(6, 80, 42, 84, 10, 88, P.wDk));
  tris.push(T(38, 78, 42, 84, 46, 82, P.wLt));

  // Pump submerged in pond (small cylinder body + cap)
  tris.push(T(20, 70, 30, 70, 30, 82, P.cMd));
  tris.push(T(20, 70, 30, 82, 20, 82, P.cDk));
  tris.push(T(18, 66, 32, 66, 32, 70, P.cDk));
  tris.push(T(18, 66, 32, 70, 18, 70, P.cXdk));

  // Rising pipe — from pump cap → short riser → horizontal, running
  // between panel bottom (y≈56) and ground (y≈78) so it doesn't cross the sky.
  // Short vertical riser from pump top
  tris.push(T(23, 62, 27, 62, 27, 66, P.cMd));
  tris.push(T(23, 62, 27, 66, 23, 66, P.cDk));
  // Horizontal run between panel and ground
  tris.push(T(23, 64, 160, 64, 160, 68, P.cMd));
  tris.push(T(23, 64, 160, 68, 23, 68, P.cDk));
  // Elbow at the bend
  tris.push(T(21, 60, 29, 60, 29, 70, P.cXdk));
  tris.push(T(21, 60, 29, 70, 21, 70, P.cBlk));

  // Replace sunbeams with 2 foreground shrubs (landscape detail)
  tris.push(T(108, 76, 112, 72, 114, 78, '#6DA843'));
  tris.push(T(46, 78, 50, 74, 52, 80, '#6DA843'));

  // Clouds — 2 tiny cloud clusters
  tris.push(T(16, 10, 28, 8, 24, 14, '#EEF3F8'));
  tris.push(T(24, 14, 36, 12, 30, 16, '#E4ECF2'));
  tris.push(T(62, 6, 76, 4, 72, 10, '#EEF3F8'));

  // Small water droplets near pump + pond surface sparkles
  tris.push(T(16, 72, 18, 72, 17, 75, P.wHi));
  tris.push(T(32, 72, 34, 72, 33, 75, P.wHi));
  tris.push(T(14, 86, 16, 86, 15, 88, P.wHi));
  tris.push(T(36, 86, 38, 86, 37, 88, P.wHi));

  // Foreground ground pebbles
  tris.push(T(58, 92, 62, 92, 60, 95, P.cMd));
  tris.push(T(100, 88, 104, 88, 102, 91, P.sDk));
  tris.push(T(132, 91, 136, 91, 134, 94, P.cDk));
  tris.push(T(70, 88, 74, 88, 72, 91, P.sMd));

  // Count so far: 12 sun + 2 hills + 2 ground + 12 panel + 3 mount +
  //   3 pond + 4 pump + 6 pipe + 2 sunbeam + 3 cloud + 4 droplets +
  //   4 pebbles = 57
  // Fill remaining 3 with ambient sparkles
  tris.push(T(110, 32, 113, 32, 111, 35, P.aHi));
  tris.push(T(50, 24, 53, 24, 51, 27, P.wHi));
  tris.push(T(150, 50, 153, 50, 151, 53, P.wHi));

  // Particles
  // Water rising through the pipe: up from pump, then horizontally to the right
  for (let i = 0; i < 5; i++) {
    parts.push(F([[25, 66], [25, 64], [160, 66]], 1.5, P.w, 0.35, i / 5));
  }
  // Pond ripples
  parts.push(Pu(16, 85, 1.0, P.wHi, 0.4, 0));
  parts.push(Pu(30, 83, 0.9, P.wHi, 0.35, 0.3));
  parts.push(Pu(42, 85, 1.0, P.wLt, 0.38, 0.5));
  // Sun glow
  parts.push(Pu(sx, sy, 5, 'rgba(255, 224, 102, 0.25)', 0.2, 0));
  return { tris: fill60(tris), parts };
}

// ---- 3: BUFFER TANK -----------------------------------------
// Cylindrical tank, no ground. Focus on tank detail: condensation,
// surface reflections, steam above vent, level markings, pipe flanges.
function scene3() {
  const tris = [];
  const parts = [];
  const tx = 58, ty = 20, tw = 44, th = 62;

  // Tank body — left shadow + right highlight + front faces (6)
  tris.push(T(tx, ty + 4, tx + 6, ty + 4, tx + 6, ty + th, P.cDk));
  tris.push(T(tx, ty + 4, tx + 6, ty + th, tx, ty + th - 4, P.cBlk));
  tris.push(T(tx + tw - 6, ty + 4, tx + tw, ty + 4, tx + tw, ty + th - 4, P.cMd));
  tris.push(T(tx + tw - 6, ty + 4, tx + tw, ty + th - 4, tx + tw - 6, ty + th, P.cHi));
  tris.push(T(tx + 6, ty + 4, tx + tw - 6, ty + 4, tx + tw - 6, ty + th, P.cHi));
  tris.push(T(tx + 6, ty + 4, tx + tw - 6, ty + th, tx + 6, ty + th, P.cMd));

  // Elliptical top cap (2)
  const cx = tx + tw / 2;
  tris.push(T(tx, ty + 4, cx, ty - 2, tx + tw, ty + 4, P.cMd));
  tris.push(T(tx, ty + 4, tx + tw, ty + 4, cx, ty + 8, P.cDk));

  // Elliptical base (2)
  tris.push(T(tx, ty + th, cx, ty + th - 4, tx + tw, ty + th, P.cDk));
  tris.push(T(tx, ty + th, tx + tw, ty + th, cx, ty + th + 4, P.cBlk));

  // Air + water surface (4)
  const wLo = ty + 20, wHi = ty + th - 5;
  tris.push(T(tx + 8, ty + 6, tx + tw - 8, ty + 6, tx + tw - 8, wLo - 1, '#EEF3F8'));
  tris.push(T(tx + 8, ty + 6, tx + tw - 8, wLo - 1, tx + 8, wLo - 1, '#E4ECF2'));
  tris.push(T(tx + 8, wLo, tx + tw - 8, wLo, tx + tw - 8, wLo + 2, P.wHi));
  tris.push(T(tx + 8, wLo, tx + tw - 8, wLo + 2, tx + 8, wLo + 2, P.w));

  // Water body — faceted rhombus (4)
  const midX = tx + tw / 2, midY = (wLo + wHi) / 2;
  tris.push(T(tx + 8, wLo + 2, tx + tw - 8, wLo + 2, midX, midY, P.w));
  tris.push(T(tx + tw - 8, wLo + 2, tx + tw - 8, wHi, midX, midY, P.wDk));
  tris.push(T(tx + tw - 8, wHi, tx + 8, wHi, midX, midY, P.wXdk));
  tris.push(T(tx + 8, wHi, tx + 8, wLo + 2, midX, midY, P.wDk));

  // Inflow pipe with flange detail (3)
  tris.push(T(40, ty + 8, tx, ty + 8, tx, ty + 14, P.cMd));
  tris.push(T(40, ty + 8, tx, ty + 14, 40, ty + 14, P.cDk));
  tris.push(T(38, ty + 6, 42, ty + 6, 40, ty + 16, P.cXdk));   // valve flange

  // Outflow pipe with flange detail (3)
  tris.push(T(tx + tw, ty + th - 12, 128, ty + th - 12, 128, ty + th - 8, P.cMd));
  tris.push(T(tx + tw, ty + th - 12, 128, ty + th - 8, tx + tw, ty + th - 8, P.cDk));
  tris.push(T(126, ty + th - 14, 130, ty + th - 14, 128, ty + th - 6, P.cXdk));

  // Tank wall highlights — 3 vertical gleam strips (3)
  tris.push(T(tx + 10, ty + 10, tx + 12, ty + 10, tx + 11, ty + th - 6, '#E6EAED'));
  tris.push(T(tx + 22, ty + 14, tx + 23, ty + 14, tx + 22.5, ty + th - 10, '#E6EAED'));
  tris.push(T(tx + tw - 16, ty + 12, tx + tw - 15, ty + 12, tx + tw - 15.5, ty + th - 8, '#D4DADE'));

  // Level markings on front face — 4 small tick marks (4)
  tris.push(T(tx + 8, ty + 28, tx + 10, ty + 28, tx + 9, ty + 29, P.cDk));
  tris.push(T(tx + 8, ty + 40, tx + 10, ty + 40, tx + 9, ty + 41, P.cDk));
  tris.push(T(tx + 8, ty + 52, tx + 10, ty + 52, tx + 9, ty + 53, P.cDk));
  tris.push(T(tx + 8, ty + 64, tx + 10, ty + 64, tx + 9, ty + 65, P.cDk));

  // Condensation droplets on the outside of the tank (6)
  tris.push(T(tx + 14, ty + 20, tx + 15, ty + 20, tx + 14.5, ty + 21.5, P.wHi));
  tris.push(T(tx + 28, ty + 32, tx + 29, ty + 32, tx + 28.5, ty + 33.5, P.wHi));
  tris.push(T(tx + 36, ty + 26, tx + 37, ty + 26, tx + 36.5, ty + 27.5, P.wLt));
  tris.push(T(tx + 20, ty + 48, tx + 21, ty + 48, tx + 20.5, ty + 49.5, P.wHi));
  tris.push(T(tx + 34, ty + 54, tx + 35, ty + 54, tx + 34.5, ty + 55.5, P.wLt));
  tris.push(T(tx + 16, ty + 56, tx + 17, ty + 56, tx + 16.5, ty + 57.5, P.wHi));

  // Steam wisps above the vent (4)
  tris.push(T(cx - 2, ty - 6, cx, ty - 10, cx + 2, ty - 6, 'rgba(230, 240, 248, 0.6)'));
  tris.push(T(cx - 4, ty - 10, cx - 2, ty - 14, cx, ty - 10, 'rgba(230, 240, 248, 0.4)'));
  tris.push(T(cx + 2, ty - 10, cx + 4, ty - 14, cx + 6, ty - 10, 'rgba(230, 240, 248, 0.4)'));
  tris.push(T(cx - 1, ty - 14, cx, ty - 18, cx + 1, ty - 14, 'rgba(230, 240, 248, 0.25)'));

  // Water surface sparkles (5)
  tris.push(T(tx + 12, wLo + 1, tx + 14, wLo + 1, tx + 13, wLo + 2, P.wHi));
  tris.push(T(tx + 22, wLo + 1, tx + 24, wLo + 1, tx + 23, wLo + 2, P.wHi));
  tris.push(T(tx + 32, wLo + 1, tx + 33, wLo + 1, tx + 32.5, wLo + 2, P.wHi));
  tris.push(T(tx + 18, wLo + 3, tx + 20, wLo + 3, tx + 19, wLo + 4, P.wLt));
  tris.push(T(tx + 28, wLo + 3, tx + 30, wLo + 3, tx + 29, wLo + 4, P.wLt));

  // Floor shadow beneath the tank (2)
  tris.push(T(tx - 4, ty + th + 4, tx + tw + 4, ty + th + 4, tx + tw, ty + th + 7, 'rgba(15, 26, 46, 0.08)'));
  tris.push(T(tx - 4, ty + th + 4, tx + tw, ty + th + 7, tx + 4, ty + th + 7, 'rgba(15, 26, 46, 0.06)'));

  // Count so far: 6 + 2 + 2 + 4 + 4 + 3 + 3 + 3 + 4 + 6 + 4 + 5 + 2 = 48
  // Fill 12 more with ambient detail
  // Condensation droplets descending (6)
  for (let i = 0; i < 6; i++) {
    const dx = tx - 2 + i * (tw + 4) / 5;
    const dy = ty + th + 2 + (i % 2) * 2;
    tris.push(T(dx, dy, dx + 1, dy, dx + 0.5, dy + 1.5, P.wHi));
  }
  // Background ambient sparkles (6)
  tris.push(T(10, 30, 12, 30, 11, 32, P.wHi));
  tris.push(T(22, 14, 24, 14, 23, 16, P.wHi));
  tris.push(T(140, 18, 142, 18, 141, 20, P.aHi));
  tris.push(T(146, 40, 148, 40, 147, 42, P.wHi));
  tris.push(T(12, 70, 14, 70, 13, 72, P.wLt));
  tris.push(T(150, 72, 152, 72, 151, 74, P.wLt));

  // Particles: inflow drops, outflow drops, steam plume, surface ripples
  for (let i = 0; i < 3; i++) {
    parts.push(F([[40, ty + 11], [tx + 8, ty + 11], [tx + 12, wLo]], 1.1, P.w, 0.28, i / 3));
  }
  for (let i = 0; i < 3; i++) {
    parts.push(F([[tx + tw - 12, wHi - 4], [tx + tw - 4, ty + th - 10], [128, ty + th - 10]], 1.1, P.wDk, 0.28, i / 3));
  }
  // Steam rising from vent
  parts.push(B(cx - 2, ty - 18, ty - 4, 0.6, 'rgba(230, 240, 248, 0.7)', 0.3, 0));
  parts.push(B(cx + 2, ty - 20, ty - 4, 0.5, 'rgba(230, 240, 248, 0.5)', 0.25, 0.4));
  // Surface sparkles
  parts.push(Pu(tx + tw * 0.35, wLo + 1, 0.9, P.wHi, 0.6, 0));
  parts.push(Pu(tx + tw * 0.65, wLo + 1, 0.9, P.wHi, 0.55, 0.4));
  return { tris: fill60(tris), parts };
}

// ---- 4: CASCADE AERATION ------------------------------------
// 4 staggered terraces; water falls STRAIGHT DOWN at the right
// edge of each step (step N+1 overlaps the right edge of step N
// so the vertical fall lands cleanly inside the next pool).
function scene4() {
  const tris = [];
  const parts = [];

  // Terrace positions — overlap so the vertical cascade lands in the next pool
  const steps = [
    [18, 22, 50, 4],     // step 1: x 18-68, right at 68
    [48, 38, 50, 4],     // step 2: x 48-98  (overlaps x 48-68 with step 1)
    [78, 54, 50, 4],     // step 3: x 78-128
    [108, 70, 50, 4]     // step 4: x 108-158
  ];
  // 4 terraces × 6 tris each = 24 tris
  for (let i = 0; i < steps.length; i++) {
    const [x, y, w, h] = steps[i];
    // Water sheen on top surface
    tris.push(T(x, y - 1, x + w, y - 1, x + w, y + 1, P.wLt));
    tris.push(T(x, y - 1, x + w, y + 1, x, y + 1, P.w));
    // Concrete step body (top + front)
    tris.push(T(x, y, x + w, y, x + w, y + h, P.cHi));
    tris.push(T(x, y, x + w, y + h, x, y + h, P.cMd));
    // Shadow beneath the step
    tris.push(T(x, y + h, x + w, y + h, x + w - 3, y + h + 2, P.cDk));
    tris.push(T(x, y + h, x + w - 3, y + h + 2, x + 3, y + h + 2, P.cXdk));
  }

  // VERTICAL waterfalls — 3 falls × 2 tris = 6 tris
  // Each fall: thin vertical rectangle at right edge of step i
  const falls = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const [x, y, w, h] = steps[i];
    const [, ny] = steps[i + 1];
    const fx = x + w;          // x of the fall = right edge of step i
    const fy1 = y + h;         // top (just below step i)
    const fy2 = ny;            // bottom (just above step i+1's surface)
    falls.push({ fx, fy1, fy2 });
    // Vertical sheet, 4 units wide
    tris.push(T(fx - 2, fy1, fx + 2, fy1, fx + 2, fy2, P.wLt));
    tris.push(T(fx - 2, fy1, fx + 2, fy2, fx - 2, fy2, P.w));
  }

  // Input pipe (2) + output pipe (2) = 4 tris
  tris.push(T(0, 18, 18, 18, 18, 22, P.cMd));
  tris.push(T(0, 18, 18, 22, 0, 22, P.cDk));
  tris.push(T(158, 72, 140, 72, 140, 76, P.cMd));
  tris.push(T(158, 72, 140, 76, 158, 76, P.cDk));

  // Output pool extending off-screen from step 4
  tris.push(T(140, 72, 158, 72, 158, 78, P.wDk));
  tris.push(T(140, 72, 158, 78, 140, 78, P.wXdk));

  // Ground band (landscape context for cascade)
  tris.push(T(0, 92, 160, 92, 160, 100, P.sLt));
  tris.push(T(0, 92, 160, 100, 0, 100, P.sMd));

  // Rocks at base around the falls (foreground interest)
  tris.push(T(8, 88, 14, 88, 11, 94, P.cDk));
  tris.push(T(20, 90, 26, 90, 23, 95, P.cMd));
  tris.push(T(146, 88, 154, 88, 150, 94, P.cDk));
  tris.push(T(130, 90, 136, 90, 133, 95, P.cMd));

  // Count so far: 24 + 6 + 4 + 2 + 2 + 4 = 42. Fill 18 more with splash droplets around each landing.
  // At each fall landing, 4 small splash droplets arranged in a radial spray.
  const splashes = [];
  for (const f of falls) {
    splashes.push([f.fx - 5, f.fy2 - 1]);
    splashes.push([f.fx - 3, f.fy2 - 2]);
    splashes.push([f.fx + 3, f.fy2 - 2]);
    splashes.push([f.fx + 5, f.fy2 - 1]);
    splashes.push([f.fx,     f.fy2 - 3]);
    splashes.push([f.fx + 6, f.fy2 + 1]);
  }
  for (let i = 0; i < 18; i++) {
    const [sxx, syy] = splashes[i] || [80, 10];
    const size = 0.55 + (i % 3) * 0.15;
    tris.push(T(sxx, syy - size, sxx - size * 0.8, syy + size * 0.6, sxx + size * 0.8, syy + size * 0.6,
      i % 3 === 0 ? P.wHi : i % 3 === 1 ? P.wLt : P.w));
  }

  // Particles — vertical water flow at each fall, rising mist, splash bubbles
  for (const f of falls) {
    // Straight-down droplets (4 per fall for denser flow)
    for (let k = 0; k < 4; k++) {
      parts.push(F([[f.fx, f.fy1], [f.fx, f.fy2]], 1.0, P.w, 0.8, k / 4));
    }
    // Rising bubbles at landing
    parts.push(B(f.fx - 4, f.fy2 - 6, f.fy2 + 2, 0.8, P.wHi, 0.6, 0));
    parts.push(B(f.fx + 4, f.fy2 - 8, f.fy2 + 2, 0.7, P.wLt, 0.55, 0.3));
    parts.push(B(f.fx,     f.fy2 - 10, f.fy2 + 2, 0.6, P.wHi, 0.5, 0.6));
    // Mist (small drift particles floating sideways)
    parts.push(D(f.fx - 8, f.fx + 8, f.fy2 - 12, f.fy2 - 4, 0.5, 'rgba(230, 240, 248, 0.7)', 0.25, 0));
  }
  // Input pipe flow
  for (let i = 0; i < 3; i++) {
    parts.push(F([[0, 20], [18, 20]], 1.2, P.w, 0.45, i / 3));
  }
  // Output pipe flow
  for (let i = 0; i < 3; i++) {
    parts.push(F([[140, 74], [158, 74]], 1.2, P.wDk, 0.45, i / 3));
  }
  return { tris: fill60(tris), parts };
}

// ---- 5: SETTLING TANK ---------------------------------------
// No ground — the tank is the subject. Rich detail in the turbid
// zone and mud V-floor.
function scene5() {
  const tris = [];
  const parts = [];
  const x1 = 16, x2 = 144, yT = 20, yB = 84;
  // walls/caps (6) — no ground
  tris.push(T(x2, yT, x2 + 6, yT + 4, x2 + 6, yB - 4, P.cDk));
  tris.push(T(x2, yT, x2 + 6, yB - 4, x2, yB, P.cBlk));
  tris.push(T(x1, yT - 3, x2, yT - 3, x2, yT, P.cHi));
  tris.push(T(x1, yT - 3, x2, yT, x1, yT, P.cMd));
  tris.push(T(x1, yB, x2, yB, x2, yB + 3, P.cDk));
  tris.push(T(x1, yB, x2, yB + 3, x1, yB + 3, P.cXdk));
  // Left wall (2) — now we need it since no ground wraps around
  tris.push(T(x1 - 3, yT, x1, yT, x1, yB, P.cMd));
  tris.push(T(x1 - 3, yT, x1, yB, x1 - 3, yB, P.cDk));
  // clear water 6 columns × 2 = 12
  const clrBot = yT + 16;
  for (let i = 0; i < 6; i++) {
    const u1 = i / 6, u2 = (i + 1) / 6;
    const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
    tris.push(T(xA, yT, xB, yT, xB, clrBot, i % 2 ? P.wLt : P.wHi));
    tris.push(T(xA, yT, xB, clrBot, xA, clrBot, i % 2 ? P.w : P.wLt));
  }
  // turbid 6×2 = 12
  const mudTop = yT + 42;
  for (let i = 0; i < 6; i++) {
    const u1 = i / 6, u2 = (i + 1) / 6;
    const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
    tris.push(T(xA, clrBot, xB, clrBot, xB, mudTop, i % 2 ? P.mud : P.sMd));
    tris.push(T(xA, clrBot, xB, mudTop, xA, mudTop, i % 2 ? P.sDk : P.mud));
  }
  // mud V-shape (6)
  const cxMid = (x1 + x2) / 2;
  tris.push(T(x1, mudTop, cxMid, mudTop, x1, yB, P.mudDk));
  tris.push(T(cxMid, mudTop, cxMid, yB, x1, yB, P.mudXdk));
  tris.push(T(cxMid, mudTop, x2, mudTop, x2, yB, P.mudDk));
  tris.push(T(cxMid, mudTop, x2, yB, cxMid, yB, P.mudXdk));
  tris.push(T(x1 + 8, yB - 6, x2 - 8, yB - 6, x2 - 14, yB, '#2A1808'));
  tris.push(T(x1 + 8, yB - 6, x2 - 14, yB, x1 + 14, yB, '#1A0804'));
  // deflector (2) + in/out pipes (4)
  tris.push(T(x1 + 12, yT, x1 + 15, yT, x1 + 15, mudTop + 4, P.sea));
  tris.push(T(x1 + 12, yT, x1 + 15, mudTop + 4, x1 + 12, mudTop + 4, P.navy));
  tris.push(T(x2, yT + 4, 160, yT + 4, 160, yT + 10, P.cMd));
  tris.push(T(x2, yT + 4, 160, yT + 10, x2, yT + 10, P.cDk));
  tris.push(T(0, clrBot - 4, x1, clrBot - 4, x1, clrBot + 2, P.cMd));
  tris.push(T(0, clrBot - 4, x1, clrBot + 2, 0, clrBot + 2, P.cDk));
  // Count so far: 8 walls + 12 clear + 12 turbid + 6 mud V + 2 deflector + 4 pipes = 44. Fill 16 with detail.
  // Water surface reflections (4)
  tris.push(T(x1 + 12, yT + 2, x1 + 14, yT + 2, x1 + 13, yT + 4, P.wHi));
  tris.push(T(x1 + 40, yT + 2, x1 + 42, yT + 2, x1 + 41, yT + 4, P.wHi));
  tris.push(T(x1 + 70, yT + 2, x1 + 72, yT + 2, x1 + 71, yT + 4, P.wLt));
  tris.push(T(x1 + 100, yT + 2, x1 + 102, yT + 2, x1 + 101, yT + 4, P.wHi));
  // Flocs in turbid zone — irregular particle shapes (6)
  tris.push(T(x1 + 22, clrBot + 8, x1 + 26, clrBot + 6, x1 + 24, clrBot + 12, P.mudDk));
  tris.push(T(x1 + 48, clrBot + 4, x1 + 52, clrBot + 6, x1 + 50, clrBot + 10, P.mud));
  tris.push(T(x1 + 74, clrBot + 10, x1 + 78, clrBot + 8, x1 + 76, clrBot + 14, P.mudDk));
  tris.push(T(x1 + 98, clrBot + 6, x1 + 102, clrBot + 8, x1 + 100, clrBot + 12, P.mud));
  tris.push(T(x1 + 60, clrBot + 16, x1 + 64, clrBot + 14, x1 + 62, clrBot + 20, P.sDk));
  tris.push(T(x1 + 84, clrBot + 18, x1 + 88, clrBot + 16, x1 + 86, clrBot + 22, P.mudDk));
  // Mud texture specks in V floor (4)
  tris.push(T(x1 + 30, yB - 12, x1 + 33, yB - 14, x1 + 32, yB - 8, P.mudXdk));
  tris.push(T(x1 + 52, yB - 8, x1 + 55, yB - 10, x1 + 54, yB - 4, '#2A1808'));
  tris.push(T(x1 + 82, yB - 10, x1 + 85, yB - 12, x1 + 84, yB - 6, P.mudXdk));
  tris.push(T(x1 + 104, yB - 14, x1 + 107, yB - 16, x1 + 106, yB - 10, '#2A1808'));
  // Deflector shadow + dark pool reflection (2)
  tris.push(T(x1 + 16, yT + 6, x1 + 18, yT + 6, x1 + 17, mudTop, 'rgba(15, 26, 46, 0.3)'));
  tris.push(T(x1 + 60, yB - 2, x1 + 70, yB - 2, x1 + 65, yB, 'rgba(15, 8, 4, 0.5)'));
  // Particles
  for (let i = 0; i < 3; i++) {
    parts.push(F([[160, yT + 7], [x2, yT + 7], [x2 - 8, clrBot + 4]], 1.2, P.mud, 0.25, i / 3));
    parts.push(F([[x1 + 20, clrBot - 2], [x1, clrBot - 1], [0, clrBot - 1]], 1.1, P.wHi, 0.28, i / 3));
  }
  for (let i = 0; i < 8; i++) {
    parts.push(D(x1 + 20 + i * 12, x1 + 28 + i * 12, clrBot + 4, mudTop - 2, 0.9, P.mudDk, 0.08, i * 0.12));
  }
  return { tris: fill60(tris), parts };
}

// ---- 6: URF — ROUGHING FILTER --------------------------------
function scene6() {
  const tris = [];
  const parts = [];
  const x1 = 60, x2 = 100, yT = 12, yB = 88;
  // walls/caps (8)
  tris.push(T(x1 - 4, yT, x1, yT, x1, yB, P.cDk));
  tris.push(T(x1 - 4, yT, x1, yB, x1 - 4, yB, P.cXdk));
  tris.push(T(x2, yT, x2 + 4, yT, x2 + 4, yB, P.cDk));
  tris.push(T(x2, yT, x2 + 4, yB, x2, yB, P.cMd));
  tris.push(T(x1 - 4, yT - 3, x2 + 4, yT - 3, x2 + 4, yT, P.cHi));
  tris.push(T(x1 - 4, yT - 3, x2 + 4, yT, x1 - 4, yT, P.cMd));
  tris.push(T(x1 - 4, yB, x2 + 4, yB, x2 + 4, yB + 3, P.cDk));
  tris.push(T(x1 - 4, yB, x2 + 4, yB + 3, x1 - 4, yB + 3, P.cXdk));
  // 4 layers × 3 cols × 2 tris = 24 layer tris
  const layers = [
    [yT, yT + 14, P.wHi, P.w],
    [yT + 14, yT + 34, '#D8D6CE', P.cHi],
    [yT + 34, yT + 54, P.cMd, '#9B9990'],
    [yT + 54, yB, P.cDk, P.cXdk]
  ];
  for (const [yA, yB2, c1, c2] of layers) {
    for (let i = 0; i < 3; i++) {
      const u1 = i / 3, u2 = (i + 1) / 3;
      const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
      tris.push(T(xA, yA, xB, yA, xB, yB2, i % 2 ? c1 : c2));
      tris.push(T(xA, yA, xB, yB2, xA, yB2, i % 2 ? c2 : c1));
    }
  }
  // Layer divider strips (3 × 2 = 6)
  for (const y of [yT + 14, yT + 34, yT + 54]) {
    tris.push(T(x1, y - 0.5, x2, y - 0.5, x2, y + 0.5, P.cBlk));
    tris.push(T(x1, y - 0.5, x2, y + 0.5, x1, y + 0.5, P.cBlk));
  }
  // Pipes in/out (4) — with flanges
  tris.push(T(36, yB - 6, x1 - 4, yB - 6, x1 - 4, yB - 2, P.cMd));
  tris.push(T(36, yB - 6, x1 - 4, yB - 2, 36, yB - 2, P.cDk));
  tris.push(T(x2 + 4, yT + 4, 124, yT + 4, 124, yT + 10, P.cMd));
  tris.push(T(x2 + 4, yT + 4, 124, yT + 10, x2 + 4, yT + 10, P.cDk));
  // Count: 8 walls + 24 layers + 6 dividers + 4 pipes = 42. Fill 18 more with contextual detail.
  // Pipe flanges (4)
  tris.push(T(34, yB - 8, 38, yB - 8, 36, yB, P.cXdk));
  tris.push(T(34, yB - 8, 36, yB, 34, yB, P.cBlk));
  tris.push(T(122, yT + 2, 126, yT + 2, 124, yT + 12, P.cXdk));
  tris.push(T(122, yT + 2, 124, yT + 12, 122, yT + 12, P.cBlk));
  // Fine particles trapped at top of each gravel layer (6)
  tris.push(T(x1 + 4, yT + 15, x1 + 6, yT + 15, x1 + 5, yT + 13, '#8B6914'));
  tris.push(T(x1 + 20, yT + 15, x1 + 22, yT + 15, x1 + 21, yT + 13, '#9B7828'));
  tris.push(T(x1 + 12, yT + 35, x1 + 14, yT + 35, x1 + 13, yT + 33, P.mud));
  tris.push(T(x1 + 26, yT + 35, x1 + 28, yT + 35, x1 + 27, yT + 33, P.mudDk));
  tris.push(T(x1 + 10, yT + 55, x1 + 12, yT + 55, x1 + 11, yT + 53, P.mudXdk));
  tris.push(T(x1 + 24, yT + 55, x1 + 26, yT + 55, x1 + 25, yT + 53, '#3A2810'));
  // Water surface sparkles on the clarified top (4)
  tris.push(T(x1 + 8, yT + 2, x1 + 9, yT + 2, x1 + 8.5, yT + 3, P.wHi));
  tris.push(T(x1 + 16, yT + 2, x1 + 17, yT + 2, x1 + 16.5, yT + 3, P.wHi));
  tris.push(T(x1 + 26, yT + 2, x1 + 27, yT + 2, x1 + 26.5, yT + 3, P.wLt));
  tris.push(T(x1 + 34, yT + 2, x1 + 35, yT + 2, x1 + 34.5, yT + 3, P.wHi));
  // Corner reinforcements (4)
  tris.push(T(x1 - 4, yT - 3, x1, yT - 3, x1, yT, P.cBlk));
  tris.push(T(x2, yT - 3, x2 + 4, yT - 3, x2 + 4, yT, P.cBlk));
  tris.push(T(x1 - 4, yB, x1, yB, x1, yB + 3, P.cBlk));
  tris.push(T(x2, yB, x2 + 4, yB, x2 + 4, yB + 3, P.cBlk));
  // Particles
  for (let i = 0; i < 3; i++) {
    parts.push(F([[36, yB - 4], [x1 + 2, yB - 4], [x1 + 2, yB - 10]], 1.1, P.mud, 0.3, i / 3));
  }
  for (let col = 0; col < 3; col++) {
    const xc = lerp(x1 + 4, x2 - 4, (col + 0.5) / 3);
    for (let i = 0; i < 3; i++) {
      parts.push(B(xc, yT + 8, yB - 8, 0.8 - col * 0.05, col === 0 ? P.wLt : P.wHi, 0.15 + col * 0.03, i / 3 + col * 0.1));
    }
  }
  for (let i = 0; i < 3; i++) {
    parts.push(F([[x2 - 4, yT + 8], [x2 + 4, yT + 7], [124, yT + 7]], 1.1, P.wHi, 0.3, i / 3));
  }
  parts.push(Pu(70, yT + 22, 0.7, '#8B6914', 0.4, 0));
  parts.push(Pu(84, yT + 28, 0.7, '#9B7828', 0.35, 0.3));
  parts.push(Pu(76, yT + 44, 0.8, P.mudDk, 0.3, 0.1));
  parts.push(Pu(90, yT + 62, 0.9, P.mudXdk, 0.25, 0.5));
  return { tris: fill60(tris), parts };
}

// ---- 7: SLOW SAND FILTER ------------------------------------
function scene7() {
  const tris = [];
  const parts = [];
  const x1 = 12, x2 = 148, yT = 14, yB = 86;
  // walls (8)
  tris.push(T(x1 - 4, yT - 4, x2 + 4, yT - 4, x2 + 4, yT, P.cHi));
  tris.push(T(x1 - 4, yT - 4, x2 + 4, yT, x1 - 4, yT, P.cMd));
  tris.push(T(x1 - 4, yB, x2 + 4, yB, x2 + 4, yB + 4, P.cDk));
  tris.push(T(x1 - 4, yB, x2 + 4, yB + 4, x1 - 4, yB + 4, P.cXdk));
  tris.push(T(x1 - 4, yT, x1, yT, x1, yB, P.cMd));
  tris.push(T(x1 - 4, yT, x1, yB, x1 - 4, yB, P.cDk));
  tris.push(T(x2, yT, x2 + 4, yT, x2 + 4, yB, P.cMd));
  tris.push(T(x2, yT, x2 + 4, yB, x2, yB, P.cDk));
  // water layer 5 cols × 2 = 10
  const wBot = yT + 14;
  for (let i = 0; i < 5; i++) {
    const u1 = i / 5, u2 = (i + 1) / 5;
    const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
    tris.push(T(xA, yT, xB, yT, xB, wBot, i % 2 ? P.wLt : P.wHi));
    tris.push(T(xA, yT, xB, wBot, xA, wBot, i % 2 ? P.w : P.wLt));
  }
  // schmutzdecke 5×2 = 10
  const sBot = wBot + 4;
  for (let i = 0; i < 5; i++) {
    const u1 = i / 5, u2 = (i + 1) / 5;
    const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
    tris.push(T(xA, wBot, xB, wBot, xB, sBot, i % 2 ? P.grDk : P.grXdk));
    tris.push(T(xA, wBot, xB, sBot, xA, sBot, i % 2 ? P.grMd : P.grDk));
  }
  // sand 5×2 = 10
  const sdBot = yB - 10;
  for (let i = 0; i < 5; i++) {
    const u1 = i / 5, u2 = (i + 1) / 5;
    const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
    tris.push(T(xA, sBot, xB, sBot, xB, sdBot, i % 2 ? P.sLt : P.sHi));
    tris.push(T(xA, sBot, xB, sdBot, xA, sdBot, i % 2 ? P.sMd : P.sLt));
  }
  // support gravel 4×2 = 8 + drainage (2) = 10
  const gBot = yB - 3;
  for (let i = 0; i < 4; i++) {
    const u1 = i / 4, u2 = (i + 1) / 4;
    const xA = lerp(x1, x2, u1), xB = lerp(x1, x2, u2);
    tris.push(T(xA, sdBot, xB, sdBot, xB, gBot, i % 2 ? P.cDk : P.cXdk));
    tris.push(T(xA, sdBot, xB, gBot, xA, gBot, i % 2 ? P.cXdk : P.cBlk));
  }
  tris.push(T(x1, gBot, x2, gBot, x2, yB, P.wDk));
  tris.push(T(x1, gBot, x2, yB, x1, yB, P.wXdk));
  // pipes in/out (4)
  tris.push(T(0, yT + 4, x1 - 4, yT + 4, x1 - 4, yT + 10, P.cMd));
  tris.push(T(0, yT + 4, x1 - 4, yT + 10, 0, yT + 10, P.cDk));
  tris.push(T(x2 + 4, yB - 2, 160, yB - 2, 160, yB + 2, P.cMd));
  tris.push(T(x2 + 4, yB - 2, 160, yB + 2, x2 + 4, yB + 2, P.cDk));
  // Count: 8 walls + 10 water + 10 schmutz + 10 sand + 8 gravel + 2 drainage + 4 pipes = 52. Fill 8 with biological/structural detail.
  // Sand grains texture (4)
  tris.push(T(30, sBot + 8, 32, sBot + 8, 31, sBot + 10, P.sMd));
  tris.push(T(60, sBot + 14, 62, sBot + 14, 61, sBot + 16, P.sDk));
  tris.push(T(92, sBot + 10, 94, sBot + 10, 93, sBot + 12, P.sMd));
  tris.push(T(124, sBot + 16, 126, sBot + 16, 125, sBot + 18, P.sDk));
  // Schmutzdecke microbes (visible green clusters) (2)
  tris.push(T(40, wBot + 1, 43, wBot + 1, 41.5, wBot + 3, '#1A3A05'));
  tris.push(T(110, wBot + 1, 113, wBot + 1, 111.5, wBot + 3, '#1A3A05'));
  // Pipe flanges (2)
  tris.push(T(x1 - 6, yT + 2, x1 - 2, yT + 2, x1 - 4, yT + 12, P.cBlk));
  tris.push(T(x2 + 2, yB - 4, x2 + 6, yB - 4, x2 + 4, yB + 4, P.cBlk));
  // Particles
  for (let i = 0; i < 3; i++) {
    parts.push(F([[0, yT + 7], [x1, yT + 7], [x1 + 6, yT + 10]], 1.1, P.mud, 0.3, i / 3));
  }
  for (let col = 0; col < 4; col++) {
    const xc = lerp(x1 + 10, x2 - 10, (col + 0.5) / 4);
    parts.push(D(xc - 1, xc + 1, wBot + 2, gBot - 1, 0.7, P.wLt, 0.08, col * 0.25));
    parts.push(D(xc - 1, xc + 1, wBot + 2, gBot - 1, 0.65, P.w, 0.09, col * 0.25 + 0.5));
  }
  for (let i = 0; i < 7; i++) {
    const xc = lerp(x1 + 8, x2 - 8, (i + 0.5) / 7);
    parts.push(Pu(xc, wBot + 2, 0.8, '#27500A', 0.5 + (i % 3) * 0.1, i * 0.13));
  }
  for (let i = 0; i < 3; i++) {
    parts.push(F([[x2 - 6, yB - 2], [x2, yB - 1], [160, yB]], 1.0, P.wHi, 0.3, i / 3));
  }
  return { tris: fill60(tris), parts };
}

// ---- 8: BIOCHAR POLISHING -----------------------------------
function scene8() {
  const tris = [];
  const parts = [];
  const x1 = 58, x2 = 102, yT = 10, yB = 86;
  // walls (8)
  tris.push(T(x1 - 4, yT, x1, yT, x1, yB, P.cDk));
  tris.push(T(x1 - 4, yT, x1, yB, x1 - 4, yB, P.cXdk));
  tris.push(T(x2, yT, x2 + 4, yT, x2 + 4, yB, P.cDk));
  tris.push(T(x2, yT, x2 + 4, yB, x2, yB, P.cMd));
  tris.push(T(x1 - 4, yT - 3, x2 + 4, yT - 3, x2 + 4, yT, P.cHi));
  tris.push(T(x1 - 4, yT - 3, x2 + 4, yT, x1 - 4, yT, P.cMd));
  tris.push(T(x1 - 4, yB, x2 + 4, yB, x2 + 4, yB + 3, P.cDk));
  tris.push(T(x1 - 4, yB, x2 + 4, yB + 3, x1 - 4, yB + 3, P.cXdk));
  // water top (2) + biochar base (2)
  const wBot = yT + 8;
  tris.push(T(x1, yT, x2, yT, x2, wBot, P.w));
  tris.push(T(x1, yT, x2, wBot, x1, wBot, P.wDk));
  const bcBot = yB - 8;
  tris.push(T(x1, wBot, x2, wBot, x2, bcBot, P.cBlk));
  tris.push(T(x1, wBot, x2, bcBot, x1, bcBot, '#1A1A18'));
  // 10 biochar pieces × 3 tris = 30
  const pieces = [
    [62, 14], [74, 15], [84, 13], [92, 16],
    [65, 26], [77, 28], [92, 30],
    [68, 40], [84, 38],
    [66, 54]
  ];
  for (const [px, py] of pieces) {
    tris.push(T(px, py, px + 8, py, px + 4, py + 7, '#3A3A38'));
    tris.push(T(px + 1.5, py + 1, px + 6.5, py + 1, px + 4, py + 5.5, '#2C2C2A'));
    tris.push(T(px + 3, py + 2, px + 5, py + 2, px + 4, py + 4, '#F5E6C8'));
  }
  // gravel (2) + drainage (2) = 4
  tris.push(T(x1, bcBot, x2, bcBot, x2, yB - 3, P.cDk));
  tris.push(T(x1, bcBot, x2, yB - 3, x1, yB - 3, P.cXdk));
  tris.push(T(x1, yB - 3, x2, yB - 3, x2, yB, P.wDk));
  tris.push(T(x1, yB - 3, x2, yB, x1, yB, P.wXdk));
  // pipes in/out (4)
  tris.push(T(36, yT + 2, x1 - 4, yT + 2, x1 - 4, yT + 8, P.cMd));
  tris.push(T(36, yT + 2, x1 - 4, yT + 8, 36, yT + 8, P.cDk));
  tris.push(T(x2 + 4, yB - 6, 130, yB - 6, 130, yB - 2, P.cMd));
  tris.push(T(x2 + 4, yB - 6, 130, yB - 2, x2 + 4, yB - 2, P.cDk));
  // Glass cup (6)
  const gx = 132, gy = yB - 14, gw = 16, gh = 18;
  tris.push(T(gx, gy, gx + gw, gy, gx + gw - 1, gy + gh, P.wLt));
  tris.push(T(gx, gy, gx + gw - 1, gy + gh, gx + 1, gy + gh, P.w));
  tris.push(T(gx + 2, gy + 6, gx + gw - 2, gy + 6, gx + gw - 3, gy + gh - 2, P.wHi));
  tris.push(T(gx + 2, gy + 6, gx + gw - 3, gy + gh - 2, gx + 3, gy + gh - 2, P.w));
  tris.push(T(gx, gy, gx + gw, gy, gx + gw, gy + 1.5, P.wHi));
  tris.push(T(gx, gy, gx + gw, gy + 1.5, gx, gy + 1.5, P.wLt));
  // Count: 8 walls + 4 water/biochar base + 30 biochar pieces + 4 gravel+drainage + 4 pipes + 6 glass = 56.
  // Fill 4 with glass + water drop detail.
  // Droplets falling into the glass cup
  tris.push(T(gx + gw * 0.4, gy - 4, gx + gw * 0.4 + 1.2, gy - 4, gx + gw * 0.4 + 0.6, gy - 2, P.wHi));
  tris.push(T(gx + gw * 0.55, gy - 2, gx + gw * 0.55 + 1.2, gy - 2, gx + gw * 0.55 + 0.6, gy, P.wHi));
  // Glass base shadow
  tris.push(T(gx - 2, gy + gh + 1, gx + gw + 2, gy + gh + 1, gx + gw, gy + gh + 3, 'rgba(15, 26, 46, 0.1)'));
  // Clean water shimmer on glass surface
  tris.push(T(gx + 4, gy + 7, gx + 10, gy + 7, gx + 7, gy + 9, P.wHi));
  // Particles
  for (let i = 0; i < 3; i++) {
    parts.push(F([[36, yT + 5], [x1, yT + 5], [x1 + 4, wBot + 2]], 1.1, '#8B6914', 0.3, i / 3));
  }
  for (let col = 0; col < 3; col++) {
    const xc = lerp(x1 + 6, x2 - 6, (col + 0.5) / 3);
    for (let i = 0; i < 2; i++) {
      parts.push(D(xc - 1, xc + 1, wBot + 2, bcBot - 1, 0.7, col === 1 ? P.wLt : P.w, 0.1, i / 2 + col * 0.15));
    }
  }
  for (let i = 0; i < 3; i++) {
    parts.push(F([[x2 - 4, yB - 4], [x2 + 4, yB - 4], [130, yB - 4], [136, gy + 8]], 1.0, P.wHi, 0.28, i / 3));
  }
  parts.push(Pu(gx + gw * 0.35, gy + 10, 0.8, P.wHi, 0.5, 0));
  parts.push(Pu(gx + gw * 0.65, gy + 14, 0.8, P.wHi, 0.45, 0.3));
  return { tris: fill60(tris), parts };
}

// ---- 9: THE FINISHED GLASS — CTA finale ---------------------
// Big faceted glass tumbler, water inside, sparkles, condensation,
// ice cubes, shadow under the glass. No ground, no cement walls —
// the glass *is* the scene.
function scene9() {
  const tris = [];
  const parts = [];
  const gx = 56, gy = 18, gw = 48, gh = 72;   // glass bounds
  const cx = gx + gw / 2;

  // Glass side perspective: left shadow strip + right highlight strip
  tris.push(T(gx - 3, gy + 4, gx, gy + 2, gx, gy + gh - 2, P.cy || '#B8CED6'));
  tris.push(T(gx - 3, gy + 4, gx, gy + gh - 2, gx - 3, gy + gh - 6, '#9BBDD4'));
  tris.push(T(gx + gw, gy + 2, gx + gw + 3, gy + 4, gx + gw + 3, gy + gh - 6, '#E4F0F7'));
  tris.push(T(gx + gw, gy + 2, gx + gw + 3, gy + gh - 6, gx + gw, gy + gh - 2, P.wHi));

  // Front face of glass — 4 vertical strips, alternating tones
  const strips = 4;
  for (let i = 0; i < strips; i++) {
    const u1 = i / strips, u2 = (i + 1) / strips;
    const x1 = gx + u1 * gw, x2 = gx + u2 * gw;
    const c1 = i % 2 ? '#D0E4EC' : '#E4F0F7';
    const c2 = i % 2 ? '#A8C4D4' : '#C0D8E4';
    tris.push(T(x1, gy + 2, x2, gy + 2, x2, gy + gh - 2, c1));
    tris.push(T(x1, gy + 2, x2, gy + gh - 2, x1, gy + gh - 2, c2));
  }

  // Water inside — surface at ~y = gy + 16 (top 20% is air space)
  const wTop = gy + 18;
  // Water surface glint (2)
  tris.push(T(gx + 4, wTop, gx + gw - 4, wTop, gx + gw - 4, wTop + 2, P.wHi));
  tris.push(T(gx + 4, wTop, gx + gw - 4, wTop + 2, gx + 4, wTop + 2, P.w));
  // Water body faceted — divide glass interior into a rhombus + 4 quadrants = 8 tris
  const midX = cx, midY = (wTop + gy + gh - 4) / 2;
  tris.push(T(gx + 4, wTop + 2, gx + gw - 4, wTop + 2, midX, midY, P.w));
  tris.push(T(gx + gw - 4, wTop + 2, gx + gw - 4, gy + gh - 6, midX, midY, P.wDk));
  tris.push(T(gx + gw - 4, gy + gh - 6, gx + 4, gy + gh - 6, midX, midY, P.wXdk));
  tris.push(T(gx + 4, gy + gh - 6, gx + 4, wTop + 2, midX, midY, P.wDk));
  // Extra water depth facets (4)
  tris.push(T(gx + 4, wTop + 10, gx + gw / 2, wTop + 18, gx + 4, wTop + 26, P.wXdk));
  tris.push(T(gx + gw - 4, wTop + 10, gx + gw - 4, wTop + 26, gx + gw / 2, wTop + 18, P.sea));
  tris.push(T(gx + 6, gy + gh - 10, gx + gw - 6, gy + gh - 10, cx, gy + gh - 6, P.sea));
  tris.push(T(gx + 6, gy + gh - 10, cx, gy + gh - 6, gx + 10, gy + gh - 4, P.wXdk));

  // Glass rim — 2 highlights at top edge
  tris.push(T(gx, gy, gx + gw, gy, gx + gw, gy + 2, P.wHi));
  tris.push(T(gx, gy, gx + gw, gy + 2, gx, gy + 2, P.wLt));

  // Glass base (elliptical hint)
  tris.push(T(gx, gy + gh - 2, cx, gy + gh - 5, gx + gw, gy + gh - 2, P.wLt));
  tris.push(T(gx, gy + gh - 2, gx + gw, gy + gh - 2, cx, gy + gh + 1, P.w));

  // Ice cubes — 3 faceted cubes floating at water surface
  //   Cube 1 (left)
  tris.push(T(gx + 8, wTop - 1, gx + 14, wTop - 3, gx + 16, wTop + 3, '#F0F8FC'));
  tris.push(T(gx + 8, wTop - 1, gx + 16, wTop + 3, gx + 10, wTop + 5, '#C8DCE6'));
  tris.push(T(gx + 14, wTop - 3, gx + 16, wTop + 3, gx + 18, wTop - 1, '#E0EEF4'));
  //   Cube 2 (centre)
  tris.push(T(cx - 4, wTop - 2, cx + 2, wTop - 4, cx + 4, wTop + 2, '#F0F8FC'));
  tris.push(T(cx - 4, wTop - 2, cx + 4, wTop + 2, cx - 2, wTop + 4, '#C8DCE6'));
  //   Cube 3 (right)
  tris.push(T(gx + gw - 18, wTop - 1, gx + gw - 12, wTop - 3, gx + gw - 10, wTop + 3, '#F0F8FC'));
  tris.push(T(gx + gw - 18, wTop - 1, gx + gw - 10, wTop + 3, gx + gw - 14, wTop + 5, '#C8DCE6'));

  // Condensation drops on the outside of the glass — 6
  tris.push(T(gx + 6, gy + 8, gx + 7, gy + 8, gx + 6.5, gy + 9.5, P.wHi));
  tris.push(T(gx + gw - 8, gy + 12, gx + gw - 7, gy + 12, gx + gw - 7.5, gy + 13.5, P.wHi));
  tris.push(T(gx + 12, gy + 24, gx + 13, gy + 24, gx + 12.5, gy + 25.5, P.wLt));
  tris.push(T(gx + gw - 14, gy + 32, gx + gw - 13, gy + 32, gx + gw - 13.5, gy + 33.5, P.wHi));
  tris.push(T(gx + 8, gy + 42, gx + 9, gy + 42, gx + 8.5, gy + 43.5, P.wLt));
  tris.push(T(gx + gw - 10, gy + 52, gx + gw - 9, gy + 52, gx + gw - 9.5, gy + 53.5, P.wHi));

  // Shadow beneath glass (2)
  tris.push(T(gx - 6, gy + gh + 2, gx + gw + 6, gy + gh + 2, gx + gw + 2, gy + gh + 6, 'rgba(15, 26, 46, 0.12)'));
  tris.push(T(gx - 6, gy + gh + 2, gx + gw + 2, gy + gh + 6, gx - 2, gy + gh + 6, 'rgba(15, 26, 46, 0.08)'));

  // Sparkles inside the water (6)
  tris.push(T(gx + 14, wTop + 14, gx + 15, wTop + 14, gx + 14.5, wTop + 15.5, P.wHi));
  tris.push(T(cx + 6, wTop + 20, cx + 7, wTop + 20, cx + 6.5, wTop + 21.5, P.wHi));
  tris.push(T(gx + gw - 16, wTop + 22, gx + gw - 15, wTop + 22, gx + gw - 15.5, wTop + 23.5, P.wLt));
  tris.push(T(gx + 18, wTop + 32, gx + 19, wTop + 32, gx + 18.5, wTop + 33.5, P.wHi));
  tris.push(T(cx - 6, wTop + 40, cx - 5, wTop + 40, cx - 5.5, wTop + 41.5, P.wLt));
  tris.push(T(gx + gw - 20, wTop + 36, gx + gw - 19, wTop + 36, gx + gw - 19.5, wTop + 37.5, P.wHi));

  // Count so far: 4 sides + 8 front + 2 surface + 8 water body + 4 depth +
  //   2 rim + 2 base + 8 ice + 6 condensation + 2 shadow + 6 sparkles = 52
  // Fill 8 more — ambient sparkles / light rays above the glass
  tris.push(T(cx - 12, gy - 6, cx - 11, gy - 6, cx - 11.5, gy - 4, P.wHi));
  tris.push(T(cx + 12, gy - 8, cx + 13, gy - 8, cx + 12.5, gy - 6, P.aHi));
  tris.push(T(cx, gy - 10, cx + 1, gy - 10, cx + 0.5, gy - 8, P.wHi));
  tris.push(T(gx - 10, gy + 20, gx - 9, gy + 20, gx - 9.5, gy + 22, P.wHi));
  tris.push(T(gx + gw + 8, gy + 24, gx + gw + 9, gy + 24, gx + gw + 8.5, gy + 26, P.wHi));
  tris.push(T(20, 40, 22, 40, 21, 42, P.wHi));
  tris.push(T(140, 44, 142, 44, 141, 46, P.aHi));
  tris.push(T(30, 72, 32, 72, 31, 74, P.wLt));

  // Particles — rising bubbles in the water, twinkle on ice, droplet about to fall in
  for (let i = 0; i < 6; i++) {
    const bx = gx + 8 + (i * 6.2) % (gw - 16);
    parts.push(B(bx, wTop + 4, gy + gh - 6, 0.7, P.wHi, 0.3 + (i % 3) * 0.05, i * 0.17));
  }
  parts.push(Pu(gx + 14, wTop - 2, 1.0, P.wHi, 0.5, 0));
  parts.push(Pu(cx, wTop - 3, 1.0, P.wHi, 0.4, 0.3));
  parts.push(Pu(gx + gw - 14, wTop - 2, 1.0, P.wHi, 0.45, 0.6));
  // Droplet falling into the glass from above (repeating)
  parts.push(F([[cx, gy - 12], [cx, wTop]], 1.2, P.wHi, 0.35, 0));
  parts.push(F([[cx - 3, gy - 10], [cx - 3, wTop]], 1.0, P.wLt, 0.3, 0.5));
  return { tris: fill60(tris), parts };
}

// =========================================================
// SETUP
// =========================================================
const SCENES_BUILD = [scene0, scene1, scene2, scene3, scene4, scene5, scene6, scene7, scene8, scene9];
const svgEl  = document.getElementById('scene');
const stage  = document.querySelector('.stage');
const steps  = document.querySelectorAll('.step');

// Pre-build every scene
const SCENE_DATA = SCENES_BUILD.map(fn => {
  const { tris, parts } = fn();
  // pre-parse colours once
  const parsed = tris.map(t => ({ p: t.p, rgba: parseColor(t.f) }));
  return { tris: parsed, parts };
});

// Create the 60 morphing polygons (one <g> for clarity)
const morphGroup = document.createElementNS(NS, 'g');
morphGroup.setAttribute('class', 'morph');
svgEl.appendChild(morphGroup);
const polys = [];
for (let i = 0; i < N; i++) {
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('class', 'tri');
  morphGroup.appendChild(poly);
  polys.push(poly);
}

// Per-scene particle layers (overlays that fade in/out)
const partLayers = SCENE_DATA.map((sd, i) => {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'parts-layer');
  g.setAttribute('data-step', String(i));
  const nodes = [];
  for (const part of sd.parts) {
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('class', 'tri part');
    poly.setAttribute('fill', part.f);
    g.appendChild(poly);
    nodes.push(poly);
  }
  svgEl.appendChild(g);
  return { g, parts: sd.parts, nodes };
});

// =========================================================
// MORPH STATE
// =========================================================
// currentTri[i] = latest rendered {p: [[x,y]×3], rgba: [...4]}
let currentTri = SCENE_DATA[0].tris.map(t => ({
  p: t.p.map(pt => pt.slice()),
  rgba: t.rgba.slice()
}));
let tweenFrom  = null;
let tweenTo    = null;
let tweenStart = 0;
let tweenActive = false;

function snapCurrentToDOM() {
  for (let i = 0; i < N; i++) {
    const c = currentTri[i];
    polys[i].setAttribute('points',
      `${c.p[0][0]},${c.p[0][1]} ${c.p[1][0]},${c.p[1][1]} ${c.p[2][0]},${c.p[2][1]}`);
    polys[i].setAttribute('fill', rgbaStr(c.rgba));
  }
}
snapCurrentToDOM();

function applyScene(idx) {
  const target = SCENE_DATA[idx].tris;
  // Capture current as FROM (could be mid-tween — that's fine, we use currentTri)
  tweenFrom = currentTri.map(t => ({ p: t.p.map(pt => pt.slice()), rgba: t.rgba.slice() }));
  tweenTo   = target.map(t => ({ p: t.p.map(pt => pt.slice()), rgba: t.rgba.slice() }));
  tweenStart = performance.now();
  tweenActive = true;
}

// =========================================================
// RENDER LOOP
// =========================================================
function updateParticle(part, node, now, visible) {
  if (!visible) {
    node.setAttribute('opacity', '0');
    return;
  }
  const tm = now / 1000;
  let cx, cy, scale = 1, alpha = 1;
  if (part.type === 'bubble') {
    const t = ((tm * part.speed + part.phase) % 1 + 1) % 1;
    cx = part.x;
    cy = lerp(part.yBot, part.yTop, t);
    scale = 1 - t * 0.4;
    alpha = t < 0.85 ? 1 : (1 - t) / 0.15;
  } else if (part.type === 'drift') {
    const t = ((tm * part.speed + part.phase) % 1 + 1) % 1;
    cy = lerp(part.yTop, part.yBot, t);
    const sway = Math.sin(tm * 1.4 + part.phase * 6) * 1.4;
    cx = (part.xMin + part.xMax) / 2 + sway;
    alpha = t < 0.9 ? 1 : (1 - t) / 0.1;
  } else if (part.type === 'pulse') {
    const t = ((tm * part.speed + part.phase) % 1 + 1) % 1;
    cx = part.x; cy = part.y;
    scale = 0.6 + 0.8 * Math.sin(t * Math.PI);
    alpha = 0.4 + 0.6 * Math.sin(t * Math.PI);
  } else {
    const t = ((tm * part.speed + part.phase) % 1 + 1) % 1;
    [cx, cy] = samplePath(part.path, t);
  }
  const pts = triAt(cx, cy, part.size * scale, tm * 0.5);
  node.setAttribute('points',
    `${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)} ` +
    `${pts[1][0].toFixed(2)},${pts[1][1].toFixed(2)} ` +
    `${pts[2][0].toFixed(2)},${pts[2][1].toFixed(2)}`);
  node.setAttribute('opacity', alpha.toFixed(2));
}

let currentStep = 0;

function renderLoop(now) {
  // Tween morphing triangles
  if (tweenActive) {
    const globalT = (now - tweenStart) / DUR_MORPH;
    let allDone = true;
    for (let i = 0; i < N; i++) {
      // Stagger: each index starts STAGGER*i ms later
      const localStart = i * STAGGER;
      const ti = Math.min(1, Math.max(0, (now - tweenStart - localStart) / DUR_MORPH));
      if (ti < 1) allDone = false;
      const e = easeOut(ti);
      const f = tweenFrom[i], t = tweenTo[i];
      currentTri[i].p[0][0] = lerp(f.p[0][0], t.p[0][0], e);
      currentTri[i].p[0][1] = lerp(f.p[0][1], t.p[0][1], e);
      currentTri[i].p[1][0] = lerp(f.p[1][0], t.p[1][0], e);
      currentTri[i].p[1][1] = lerp(f.p[1][1], t.p[1][1], e);
      currentTri[i].p[2][0] = lerp(f.p[2][0], t.p[2][0], e);
      currentTri[i].p[2][1] = lerp(f.p[2][1], t.p[2][1], e);
      currentTri[i].rgba = lerpColor(f.rgba, t.rgba, e);
    }
    snapCurrentToDOM();
    if (allDone) tweenActive = false;
  }
  // Particle overlays — only animate the current scene's particles
  for (let si = 0; si < partLayers.length; si++) {
    const visible = (si === currentStep);
    const layer = partLayers[si];
    for (let k = 0; k < layer.parts.length; k++) {
      updateParticle(layer.parts[k], layer.nodes[k], now, visible);
    }
  }
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

// =========================================================
// CONTAMINANT INDICATORS
// Levels at the end of each scene (turbidity · gases · pathogens · organics, %)
// =========================================================
const LEVELS = [
  { turb:100, gas:100, path:100, org:100 }, // 0 Intro
  { turb:100, gas:100, path:100, org:100 }, // 1 Night
  { turb:100, gas:100, path:100, org:100 }, // 2 Solar pumping
  { turb:100, gas:100, path:100, org:100 }, // 3 Buffer tank
  { turb:100, gas:10,  path:100, org:100 }, // 4 Cascade aeration
  { turb:40,  gas:10,  path:100, org:100 }, // 5 Settling tank
  { turb:5,   gas:5,   path:90,  org:100 }, // 6 URF
  { turb:0,   gas:0,   path:1,   org:70  }, // 7 Slow sand filter
  { turb:0,   gas:0,   path:0,   org:0   }, // 8 Biochar
  { turb:0,   gas:0,   path:0,   org:0   }  // 9 Finished glass
];
const indEls = {
  turb: document.getElementById('val-turb'),
  gas:  document.getElementById('val-gas'),
  path: document.getElementById('val-path'),
  org:  document.getElementById('val-org')
};
const barEls = {
  turb: document.getElementById('bar-turb'),
  gas:  document.getElementById('bar-gas'),
  path: document.getElementById('bar-path'),
  org:  document.getElementById('bar-org')
};
const deltaEls = {
  turb: document.getElementById('delta-turb'),
  gas:  document.getElementById('delta-gas'),
  path: document.getElementById('delta-path'),
  org:  document.getElementById('delta-org')
};
function updateIndicators(sceneIdx) {
  const L    = LEVELS[Math.min(sceneIdx, LEVELS.length - 1)];
  const prevL = LEVELS[Math.max(0, sceneIdx - 1)];
  for (const k of ['turb', 'gas', 'path', 'org']) {
    const next      = L[k];
    const prevShown = parseInt(indEls[k].textContent, 10);
    const reduction = prevL[k] - next;
    if (prevShown !== next) {
      indEls[k].classList.add('ind-changed');
      setTimeout(() => indEls[k].classList.remove('ind-changed'), 800);
    }
    indEls[k].textContent  = next + '%';
    barEls[k].style.width  = next + '%';
    if (reduction > 0 && sceneIdx > 0) {
      deltaEls[k].textContent = `−${reduction}%`;
      deltaEls[k].classList.add('show');
    } else {
      deltaEls[k].classList.remove('show');
    }
  }
}

// =========================================================
// SNAP SCROLL ENGINE
// =========================================================
const scrollColEl   = document.querySelector('.scroll-col');
const snapDotsEl    = document.getElementById('snapDots');
const progressFill  = document.getElementById('snapProgressFill');
const TOTAL_STEPS   = steps.length;   // 10 (steps 0–9)

// ---- Progress dots (desktop) ----
const dotEls = [];
for (let i = 0; i < TOTAL_STEPS; i++) {
  const btn = document.createElement('button');
  btn.className = 'snap-dot';
  btn.setAttribute('aria-label', `Go to stage ${i}`);
  const label = steps[i].querySelector('.step-eyebrow');
  if (label) btn.setAttribute('title', label.textContent.trim());
  btn.addEventListener('click', () => scrollToStep(i));
  snapDotsEl.appendChild(btn);
  dotEls.push(btn);
}

// ---- Update dots + progress bar ----
function updateDotsAndProgress(idx) {
  dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
  snapDotsEl.classList.toggle('night', idx === 1);
  if (progressFill) {
    progressFill.style.width =
      ((idx / Math.max(1, TOTAL_STEPS - 1)) * 100).toFixed(1) + '%';
  }
}

// ---- Smooth scroll to a step ----
function scrollToStep(idx) {
  const clamped = Math.max(0, Math.min(TOTAL_STEPS - 1, idx));
  const stepH   = scrollColEl.clientHeight;
  scrollColEl.scrollTo({ top: clamped * stepH, behavior: 'smooth' });
}

// ---- Main setStep (called whenever the active stage changes) ----
function setStep(idx) {
  if (idx === currentStep) return;
  const sceneIdx    = Math.min(idx, SCENE_DATA.length - 1);
  const sceneChanged = sceneIdx !== Math.min(currentStep, SCENE_DATA.length - 1);
  currentStep = sceneIdx;
  if (sceneChanged) applyScene(sceneIdx);
  stage.classList.toggle('night', sceneIdx === 1);
  steps.forEach(s => {
    const sIdx = parseInt(s.dataset.step, 10);
    s.classList.toggle('active', sIdx === idx);
  });
  updateIndicators(sceneIdx);
  updateDotsAndProgress(sceneIdx);
}

// ---- Scroll listener — detect snap position ----
// Fires both during scroll (for early morph trigger) and after settle (for accuracy).
let _scrollTimer;
let _lastNearStep = 0;

scrollColEl.addEventListener('scroll', () => {
  const stepH = scrollColEl.clientHeight;
  if (stepH < 1) return;

  // Early trigger: as soon as we cross the midpoint between two steps
  const nearest = Math.round(scrollColEl.scrollTop / stepH);
  if (nearest !== _lastNearStep) {
    _lastNearStep = nearest;
    setStep(nearest);
  }

  // Settle trigger: wait for snap to fully finish, then confirm
  clearTimeout(_scrollTimer);
  _scrollTimer = setTimeout(() => {
    const settled = Math.round(scrollColEl.scrollTop / stepH);
    setStep(settled);
  }, 90);
}, { passive: true });

// ---- Keyboard navigation ----
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    scrollToStep(currentStep + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    scrollToStep(currentStep - 1);
  } else if (e.key === 'Home') {
    e.preventDefault();
    scrollToStep(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    scrollToStep(TOTAL_STEPS - 1);
  }
});

// ---- Recalibrate after resize (step heights change with viewport) ----
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const stepH = scrollColEl.clientHeight;
    // Jump to current step without animation to avoid stale scroll position
    scrollColEl.scrollTo({ top: currentStep * stepH, behavior: 'instant' });
  }, 150);
}, { passive: true });

// ---- Initialise ----
updateIndicators(0);
updateDotsAndProgress(0);
steps[0].classList.add('active');
