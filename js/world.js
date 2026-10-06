import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_MAX_Y,
  BLOCK,
  CHUNK_SIZE,
  T_SAND,
  T_DESERT,
  T_SNOW,
  T_STONE,
  T_TAIGA,
  T_GRASS,
  T_FOREST,
  T_DEEP,
  TERRAIN_BASE_Y,
  getSeaLevelY,
} from "./config.js";
import { generateSurfaceMaps, heightToBlockY, tileIsWater } from "./procgen.js";

function surfaceBlockFromTile(tid) {
  switch (tid) {
    case T_SAND:
    case T_DESERT:
      return BLOCK.SAND;
    case T_SNOW:
      return BLOCK.SNOW;
    case T_STONE:
      return BLOCK.STONE;
    case T_TAIGA:
      return BLOCK.TAIGA_GRASS;
    case T_FOREST:
    case T_GRASS:
    default:
      return BLOCK.GRASS;
  }
}

function subSurfaceBlock(tid) {
  if (tid === T_SAND || tid === T_DESERT) return BLOCK.SAND;
  if (tid === T_SNOW) return BLOCK.DIRT;
  return BLOCK.DIRT;
}

function seabedBlock(tid) {
  return tid === T_DEEP ? BLOCK.STONE : BLOCK.SAND;
}

export class VoxelWorld {
  constructor(seed, options = {}) {
    this.seed = seed;
    this.options = { ...options };
    this.blocks = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT * WORLD_MAX_Y);
    this.hmap = null;
    this.tiles = null;
    this.seaLevelY = getSeaLevelY();
    this.spawn = { x: WORLD_WIDTH / 2, y: 20, z: WORLD_HEIGHT / 2 };
    this.dirtyChunks = new Set();
    this.fluidSimulator = null;
    this.generate();
  }

  inBounds(x, y, z) {
    return x >= 0 && z >= 0 && y >= 0 && x < WORLD_WIDTH && z < WORLD_HEIGHT && y < WORLD_MAX_Y;
  }

  idx(x, y, z) {
    if (!this.inBounds(x, y, z)) return -1;
    return x + z * WORLD_WIDTH + y * WORLD_WIDTH * WORLD_HEIGHT;
  }

  getBlock(x, y, z) {
    const i = this.idx(x, y, z);
    if (i < 0) return BLOCK.AIR;
    return this.blocks[i];
  }

  setBlock(x, y, z, id) {
    const i = this.idx(x, y, z);
    if (i < 0) return false;
    const old = this.blocks[i];
    if (old === id) return false;
    this.blocks[i] = id;
    this.markChunkDirty(x, z);
    if (this.fluidSimulator) this.fluidSimulator.onBlockChanged(x, y, z, old, id);
    return true;
  }

  setBlockRaw(x, y, z, id) {
    const i = this.idx(x, y, z);
    if (i < 0) return false;
    const old = this.blocks[i];
    if (old === id) return false;
    this.blocks[i] = id;
    this.markChunkDirty(x, z);
    return true;
  }

  isOpaque(id) {
    return id !== BLOCK.AIR && id !== BLOCK.WATER && id !== BLOCK.LEAVES;
  }

  isSolid(id) {
    return id !== BLOCK.AIR && id !== BLOCK.WATER;
  }

  isWater(id) {
    return id === BLOCK.WATER;
  }

  isFluid(id) {
    return id === BLOCK.WATER;
  }

  markChunkDirty(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.dirtyChunks.add(`${cx},${cz}`);
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  columnHasOcean(x, z, surfaceY, tid) {
    return tileIsWater(tid) || surfaceY < this.seaLevelY;
  }

  generate() {
    this.blocks.fill(0);
    this.dirtyChunks.clear();

    const { hmap, tiles, treeSpots } = generateSurfaceMaps(this.seed, this.options);
    this.hmap = hmap;
    this.tiles = tiles;
    this.seaLevelY = getSeaLevelY();

    const withWater = this.options.water !== false;
    let bestSpawn = null;

    for (let z = 0; z < WORLD_HEIGHT; z++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const tid = tiles[z][x];
        const surfaceY = heightToBlockY(hmap[z][x]);
        const ocean = this.columnHasOcean(x, z, surfaceY, tid);
        const sea = this.seaLevelY;

        if (!ocean) {
          const cx = WORLD_WIDTH / 2;
          const cz = WORLD_HEIGHT / 2;
          const d = (x - cx) ** 2 + (z - cz) ** 2;
          if (!bestSpawn || d < bestSpawn.d) {
            bestSpawn = { x: x + 0.5, y: surfaceY + 2.75, z: z + 0.5, d };
          }
        }

        const top = surfaceBlockFromTile(tid);
        const sub = subSurfaceBlock(tid);
        const floorY = ocean ? Math.min(surfaceY, sea) : surfaceY;

        for (let y = 0; y <= floorY && y < WORLD_MAX_Y; y++) {
          let block = BLOCK.STONE;
          if (ocean) {
            if (y === floorY) block = seabedBlock(tid);
            else if (y >= floorY - 3) block = BLOCK.SAND;
          } else if (y === floorY) {
            block = top;
          } else if (y >= floorY - 3) {
            block = sub;
          }
          this.setBlockQuiet(x, y, z, block);
        }

        if (withWater && ocean && floorY < sea) {
          for (let y = floorY + 1; y <= sea && y < WORLD_MAX_Y; y++) {
            this.setBlockQuiet(x, y, z, BLOCK.WATER);
          }
        }
      }
    }

    for (const [tx, tz, height] of treeSpots) {
      const groundY = heightToBlockY(hmap[tz][tx]);
      if (tileIsWater(tiles[tz][tx])) continue;
      if (groundY >= this.seaLevelY) {
        for (let dy = 1; dy <= height; dy++) {
          this.setBlockQuiet(tx, groundY + dy, tz, BLOCK.WOOD);
        }
        const leafBase = groundY + height - 1;
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = 0; dy <= 2; dy++) {
              if (Math.abs(dx) + Math.abs(dz) + dy > 4) continue;
              const lx = tx + dx;
              const lz = tz + dz;
              const ly = leafBase + dy;
              if (this.getBlock(lx, ly, lz) === BLOCK.AIR) {
                this.setBlockQuiet(lx, ly, lz, BLOCK.LEAVES);
              }
            }
          }
        }
      }
    }

    if (bestSpawn) this.spawn = bestSpawn;
    this.markAllChunksDirty();
  }

  setBlockQuiet(x, y, z, id) {
    const i = this.idx(x, y, z);
    if (i >= 0) this.blocks[i] = id;
  }

  markAllChunksDirty() {
    const chunksX = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
    const chunksZ = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        this.dirtyChunks.add(this.chunkKey(cx, cz));
      }
    }
  }

  regenerate(options) {
    this.options = { ...this.options, ...options };
    this.generate();
  }
}
