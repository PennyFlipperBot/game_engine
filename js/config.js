/** Voxel engine constants — visual parity with Deadzone. */

export const VOXEL_SIZE = 0.5;

export function blockToWorld(v) {
  return v * VOXEL_SIZE;
}

export function worldToBlockFloor(v) {
  return Math.floor(v / VOXEL_SIZE);
}

export const WORLD_WIDTH = 256;
export const WORLD_HEIGHT = 256;
export const WORLD_MAX_Y = 128;
export const CHUNK_SIZE = 16;
export const CHUNK_RENDER_RADIUS = 8;
export const MESH_CHUNKS_PER_FRAME = 3;
export const FLUID_STEPS_PER_FRAME = 24;
export const FLUID_STEPS_HEAVY = 10;

export const SEA_LEVEL = 0.38;
export const MOUNTAIN_LINE = 0.62;
export const SNOW_HEIGHT = 0.58;

export const TERRAIN_BASE_Y = 4;
export const TERRAIN_HEIGHT_SCALE = 28;

export function getSeaLevelY() {
  return Math.floor(TERRAIN_BASE_Y + SEA_LEVEL * TERRAIN_HEIGHT_SCALE);
}

export const T_DEEP = 0;
export const T_WATER = 1;
export const T_SHALLOW = 2;
export const T_SAND = 3;
export const T_GRASS = 4;
export const T_FOREST = 5;
export const T_DESERT = 6;
export const T_TAIGA = 7;
export const T_SNOW = 8;
export const T_STONE = 9;

export const WATER_TILES = new Set([T_DEEP, T_WATER, T_SHALLOW]);

export const BLOCK = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  SNOW: 8,
  TAIGA_GRASS: 10,
};

export const BLOCK_COLORS = {
  [BLOCK.STONE]: [118, 116, 122],
  [BLOCK.DIRT]: [96, 72, 48],
  [BLOCK.GRASS]: [86, 132, 68],
  [BLOCK.SAND]: [206, 192, 148],
  [BLOCK.WATER]: [52, 108, 168],
  [BLOCK.WOOD]: [92, 64, 40],
  [BLOCK.LEAVES]: [48, 98, 58],
  [BLOCK.SNOW]: [228, 236, 242],
  [BLOCK.TAIGA_GRASS]: [68, 102, 82],
};

export const WORLD_PRESETS = {
  island: { label: "Island", water: true, mountains: 0.6, trees: 0.5 },
  hills: { label: "Rolling Hills", water: true, mountains: 0.45, trees: 0.7 },
  flat: { label: "Flat Arena", water: false, mountains: 0.05, trees: 0.1 },
  desert: { label: "Desert", water: false, mountains: 0.3, trees: 0.0 },
};

export const CAMERA_PRESETS = {
  "first-person": { label: "1st Person", crosshair: true, pointerLock: true },
  "third-person": { label: "3rd Person", crosshair: false, pointerLock: true },
  "top-down": { label: "Top Down", crosshair: false, pointerLock: false },
  "side-2d": { label: "2D Side", crosshair: false, pointerLock: false },
};
