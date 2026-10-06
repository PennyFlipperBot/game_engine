/** Height, temperature, moisture maps → surface biome tiles (Deadzone-style). */
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SEA_LEVEL,
  MOUNTAIN_LINE,
  SNOW_HEIGHT,
  WATER_TILES,
  TERRAIN_BASE_Y,
  TERRAIN_HEIGHT_SCALE,
  T_DEEP,
  T_WATER,
  T_SHALLOW,
  T_SAND,
  T_GRASS,
  T_FOREST,
  T_DESERT,
  T_TAIGA,
  T_SNOW,
  T_STONE,
} from "./config.js";
import { fbm, smoothstep, mulberry32 } from "./noise.js";

function isWater(h) {
  return h < SEA_LEVEL;
}

function neighborWater(hmap, x, y) {
  for (const [dx, dy] of [
    [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
      if (isWater(hmap[ny][nx])) return true;
    }
  }
  return false;
}

function blurMap2D(map, radius, passes) {
  const w = WORLD_WIDTH;
  const h = WORLD_HEIGHT;
  const tmp = Array.from({ length: h }, () => new Float32Array(w));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          sum += map[y][nx];
        }
        tmp[y][x] = sum / (radius * 2 + 1);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          sum += tmp[ny][x];
        }
        map[y][x] = sum / (radius * 2 + 1);
      }
    }
  }
}

function applyScatteredLandmarks(hmap, volc, seed, sH, sChaosRegion) {
  const sRegion = 128 + (seed % 11) * 5;
  const sChaos = sChaosRegion;
  const peakScale = sH * 0.5;
  const chaosScale = sH * 0.38;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const regionM = fbm(seed ^ 0xa511e9b3, x / sRegion, y / sRegion, 4);
      const regionC = fbm(seed ^ 0x2f693d42, x / sChaos + 41.7, y / sChaos - 18.3, 4);
      const regionBlend = fbm(seed ^ 0x7f4a7c15, x / (sRegion * 1.35), y / (sRegion * 1.35), 3);

      let mountainMask = smoothstep(0.73, 0.91, regionM) * smoothstep(0.38, 0.78, regionBlend);
      let chaosMask = smoothstep(0.71, 0.89, regionC) * (1 - mountainMask * 0.9);

      if (mountainMask <= 0.001 && chaosMask <= 0.001) continue;

      let h = hmap[y][x];

      if (mountainMask > 0.001) {
        const px = x / peakScale;
        const py = y / peakScale;
        const peakBody = fbm(seed ^ 0x510e527f, px, py, 5);
        const ridge =
          Math.abs(fbm(seed ^ 0x9b05688c, px * 1.65, py * 1.65, 4) - 0.5) * 0.42;
        const uplift = mountainMask * (0.14 + peakBody * 0.36 + ridge);
        h = Math.min(1, h + uplift);
        volc[y][x] = Math.min(1, volc[y][x] + mountainMask * 0.12);
      }

      if (chaosMask > 0.001) {
        const cw = chaosScale;
        const cwx = (fbm(seed ^ 0x6ed82b79, x / cw, y / cw, 3) - 0.5) * 10.5;
        const cwy = (fbm(seed ^ 0x1a2b3c4d, x / cw + 9.1, y / cw + 4.6, 3) - 0.5) * 10.5;
        const rx = (x + cwx) / 10.5;
        const ry = (y + cwy) / 10.5;
        const rough = fbm(seed ^ 0x5be0cd19, rx, ry, 6);
        const spikes =
          Math.abs(fbm(seed ^ 0x428a2f98, rx * 1.9, ry * 1.9, 4) - 0.5) * 0.38;
        const delta = (rough - 0.5) * 0.34 + spikes;
        h = Math.min(1, Math.max(0, h + delta * chaosMask));
        volc[y][x] = Math.min(1, volc[y][x] + chaosMask * 0.06);
      }

      hmap[y][x] = h;
    }
  }
}

function applyPresetModifiers(hmap, mmap, tmap, options = {}) {
  const preset = options.preset ?? "hills";
  const mountain = options.mountains ?? 0.5;
  const cx = WORLD_WIDTH / 2;
  const cz = WORLD_HEIGHT / 2;
  const maxDist = Math.sqrt(cx * cx + cz * cz);

  for (let z = 0; z < WORLD_HEIGHT; z++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      let h = hmap[z][x];

      if (preset === "flat") {
        h = 0.42 + h * 0.04;
      } else if (preset === "island") {
        const dx = x - cx;
        const dz = z - cz;
        const dist = Math.sqrt(dx * dx + dz * dz) / maxDist;
        const falloff = 1 - smoothstep(0.55, 1.0, dist);
        h = h * falloff * mountain + SEA_LEVEL * (1 - falloff);
      } else if (preset === "desert") {
        h = 0.38 + h * 0.25 * mountain;
        mmap[z][x] = Math.max(0, mmap[z][x] - 0.35);
        tmap[z][x] = Math.min(1, tmap[z][x] + 0.25);
      } else if (preset === "hills") {
        h = 0.3 + (h - 0.3) * mountain * 1.2;
      }

      hmap[z][x] = Math.min(1, Math.max(0, h));
    }
  }
}

export function classifyTile(hmap, tmap, mmap, x, y) {
  const h = hmap[y][x];
  const temp = tmap[y][x];
  if (isWater(h)) {
    const depth = SEA_LEVEL - h;
    if (depth > 0.12) return T_DEEP;
    if (depth > 0.04) return T_WATER;
    return T_SHALLOW;
  }

  if (h >= MOUNTAIN_LINE) return T_STONE;
  if (h >= SNOW_HEIGHT && (temp < 0.42 || h > 0.56)) return T_SNOW;

  if (h < SEA_LEVEL + 0.045 || (h < SEA_LEVEL + 0.09 && neighborWater(hmap, x, y))) {
    return T_SAND;
  }

  const moist = mmap[y][x];
  if (temp > 0.58 && moist < 0.38) return T_DESERT;
  if (temp < 0.36 && moist > 0.28) return T_TAIGA;
  if (temp > 0.22 && temp < 0.72 && moist > 0.52) return T_FOREST;
  if (temp < 0.28 && h > 0.48) return T_SNOW;
  return T_GRASS;
}

function generateHeightTempMoist(seed) {
  const hmap = Array.from({ length: WORLD_HEIGHT }, () => new Float32Array(WORLD_WIDTH));
  const tmap = Array.from({ length: WORLD_HEIGHT }, () => new Float32Array(WORLD_WIDTH));
  const mmap = Array.from({ length: WORLD_HEIGHT }, () => new Float32Array(WORLD_WIDTH));
  const volc = Array.from({ length: WORLD_HEIGHT }, () => new Float32Array(WORLD_WIDTH));
  const tempBase = Array.from({ length: WORLD_HEIGHT }, () => new Float32Array(WORLD_WIDTH));

  const sH = 28.0 + (seed % 17) * 0.45;
  const sT = 62.0 + (seed % 23) * 0.8;
  const sM = 52.0 + (seed % 19) * 0.6;
  const sBig = sH * 2.85;
  const sChaosRegion = 92 + (seed % 13) * 4;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    const lat = (y / WORLD_HEIGHT) * 2.0 - 1.0;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const bx = x / sBig;
      const by = y / sBig;
      let mtnMask = fbm(seed ^ 0x2f4a7c31, bx, by, 3);
      mtnMask = smoothstep(0.32, 0.72, mtnMask);

      const warpS = sH * 0.62;
      const wx = (fbm(seed ^ 0x6a09e667, x / warpS, y / warpS, 2) - 0.5) * 4.2;
      const wy = (fbm(seed ^ 0xbb67ae85, x / warpS + 19.2, y / warpS + 8.4, 2) - 0.5) * 4.2;
      const nx = (x + wx) / sH;
      const ny = (y + wy) / sH;

      let h = fbm(seed ^ 0x9e3779b9, nx, ny, 4);
      const ridge =
        Math.abs(fbm(seed ^ 0x85ebca6b, nx * 1.35, ny * 1.35, 3) - 0.5) * 0.16 * mtnMask;
      h = h * (0.74 + 0.42 * mtnMask) + ridge + 0.04;
      hmap[y][x] = Math.min(1, Math.max(0, h));

      const tx = x / sT;
      const ty = y / sT;
      tempBase[y][x] = fbm(seed ^ 0xc2b2ae3d, tx + 10.2, ty + 3.7, 3) - 0.45 * lat;

      const mx = x / sM;
      const my = y / sM;
      mmap[y][x] = fbm(seed ^ 0x165667b1, mx - 7.1, my + 11.4, 4);
      volc[y][x] = fbm(seed ^ 0xdeadbeef, x / 58.0, y / 58.0, 3);
    }
  }

  blurMap2D(hmap, 3, 2);
  blurMap2D(mmap, 2, 1);

  applyScatteredLandmarks(hmap, volc, seed, sH, sChaosRegion);
  blurMap2D(hmap, 1, 1);

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      let temp = tempBase[y][x] - 0.08 * (hmap[y][x] - 0.5);
      temp = temp + 0.06 * (volc[y][x] - 0.5);
      tmap[y][x] = Math.min(1, Math.max(0, temp));
    }
  }
  blurMap2D(tmap, 2, 1);

  return { hmap, tmap, mmap };
}

export function generateSurfaceMaps(seed, options = {}) {
  const { hmap, tmap, mmap } = generateHeightTempMoist(seed);
  applyPresetModifiers(hmap, mmap, tmap, options);

  const tiles = Array.from({ length: WORLD_HEIGHT }, () => new Int8Array(WORLD_WIDTH));
  const forestCells = [];
  const rnd = mulberry32(seed ^ 0x1234567);
  const treeDensity = options.trees ?? 0.5;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const tid = classifyTile(hmap, tmap, mmap, x, y);
      tiles[y][x] = tid;
      if (tid === T_FOREST && rnd() < 0.12 * treeDensity) {
        forestCells.push([x, y]);
      }
    }
  }

  const treeSpots = [];
  const trTrees = mulberry32(seed ^ 0x3c6ef372);
  for (const [x, y] of forestCells) {
    treeSpots.push([x, y, 4 + ((trTrees() * 3) | 0)]);
  }

  return { hmap, tiles, treeSpots };
}

export function heightToBlockY(hNorm) {
  return Math.floor(TERRAIN_BASE_Y + hNorm * TERRAIN_HEIGHT_SCALE);
}

export function tileIsWater(tid) {
  return WATER_TILES.has(tid);
}

export { isWater };
