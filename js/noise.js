/** Deterministic noise for procedural terrain. */

function u32(n) {
  return n >>> 0;
}

export function hash01(seed, x, y) {
  let n = u32(seed * 374761393 + x * 668265263 + y * 1274126177);
  n = u32((n ^ (n >>> 13)) * 1274126177);
  return (u32(n ^ (n >>> 16)) & 0x7fffffff) / 2147483647.0;
}

function smooth(t) {
  return t * t * (3.0 - 2.0 * t);
}

export function noise2(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const n00 = hash01(seed, x0, y0);
  const n10 = hash01(seed, x0 + 1, y0);
  const n01 = hash01(seed, x0, y0 + 1);
  const n11 = hash01(seed, x0 + 1, y0 + 1);
  const sx = smooth(xf);
  const sy = smooth(yf);
  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
}

export function fbm(seed, x, y, octaves = 5) {
  let v = 0;
  let a = 0.5;
  let f = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2(seed + i * 7919, x * f, y * f);
    norm += a;
    a *= 0.5;
    f *= 2.0;
  }
  return norm ? v / norm : 0;
}

export function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  let t = (x - edge0) / (edge1 - edge0);
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

export function newWorldSeed() {
  return (Math.random() * 0x7fffffff) | 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
