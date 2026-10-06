import { BLOCK, SEA_LEVEL } from "./config.js";
import { tileIsWater } from "./procgen.js";

const HORIZONTAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const WATER_SPREAD_RANGE = 7;

export class FluidSimulator {
  constructor(world) {
    this.world = world;
    /** @type {Set<string>} */
    this.queue = new Set();
    /** @type {Map<string, number>} */
    this.dist = new Map();
    this.needsSeaRebuild = false;
  }

  static key(x, y, z) {
    return `${x},${y},${z}`;
  }

  onBlockChanged(x, y, z, oldId, newId) {
    this.wake(x, y, z, 0);
    for (const [dx, dy, dz] of [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ]) {
      this.wake(x + dx, y + dy, z + dz, 0);
    }
    if (oldId === BLOCK.WATER && y === this.world.seaLevelY) this.needsSeaRebuild = true;
    if (newId === BLOCK.WATER && y === this.world.seaLevelY) this.needsSeaRebuild = true;
  }

  wake(x, y, z, dist) {
    if (!this.world.inBounds(x, y, z)) return;
    const k = FluidSimulator.key(x, y, z);
    if (!this.queue.has(k)) {
      this.queue.add(k);
      this.dist.set(k, dist);
    } else {
      const prev = this.dist.get(k);
      if (prev === undefined || dist < prev) this.dist.set(k, dist);
    }
  }

  isOceanColumn(x, z) {
    if (this.world.tiles) return tileIsWater(this.world.tiles[z][x]);
    if (!this.world.hmap) return false;
    return this.world.hmap[z][x] < SEA_LEVEL;
  }

  isWaterSource(x, y, z) {
    if (this.world.getBlock(x, y, z) !== BLOCK.WATER) return false;
    return y === this.world.seaLevelY && this.isOceanColumn(x, z);
  }

  hasSolidOrFluidBelow(x, y, z) {
    if (y <= 0) return true;
    return this.world.getBlock(x, y - 1, z) !== BLOCK.AIR;
  }

  shouldFillWater(x, y, z, spreadDist) {
    if (this.world.getBlock(x, y, z) !== BLOCK.AIR) return false;
    if (y > this.world.seaLevelY && spreadDist > WATER_SPREAD_RANGE) return false;
    if (this.world.getBlock(x, y + 1, z) === BLOCK.WATER) return true;

    if (this.isOceanColumn(x, z) && y <= this.world.seaLevelY) {
      if (this.world.getBlock(x, y + 1, z) === BLOCK.WATER) return true;
      for (const [dx, dz] of HORIZONTAL) {
        if (this.world.getBlock(x + dx, y, z + dz) === BLOCK.WATER) return true;
      }
      if (y === this.world.seaLevelY) return true;
      if (this.hasSolidOrFluidBelow(x, y, z)) return true;
    }

    if (!this.hasSolidOrFluidBelow(x, y, z)) return false;

    for (const [dx, dz] of HORIZONTAL) {
      const nx = x + dx;
      const nz = z + dz;
      if (this.world.getBlock(nx, y, nz) === BLOCK.WATER) return true;
      if (this.isWaterSource(nx, y, nz)) return true;
    }

    return spreadDist <= WATER_SPREAD_RANGE;
  }

  setFluid(x, y, z, id) {
    const old = this.world.getBlock(x, y, z);
    if (old === id) return false;
    this.world.setBlockRaw(x, y, z, id);
    if (id === BLOCK.WATER && y === this.world.seaLevelY) this.needsSeaRebuild = true;
    return true;
  }

  stepWater(x, y, z, spreadDist) {
    if (this.world.getBlock(x, y, z) !== BLOCK.WATER) return;

    const below = y > 0 ? this.world.getBlock(x, y - 1, z) : BLOCK.STONE;
    if (below === BLOCK.AIR) {
      this.setFluid(x, y - 1, z, BLOCK.WATER);
      this.setFluid(x, y, z, BLOCK.AIR);
      this.wake(x, y - 1, z, spreadDist);
      this.wake(x, y, z, spreadDist);
      return;
    }

    if (spreadDist >= WATER_SPREAD_RANGE && !this.isOceanColumn(x, z)) return;

    for (const [dx, dz] of HORIZONTAL) {
      const nx = x + dx;
      const nz = z + dz;
      if (!this.world.inBounds(nx, y, nz)) continue;
      if (this.world.getBlock(nx, y, nz) !== BLOCK.AIR) continue;
      const nd = spreadDist + 1;
      if (!this.shouldFillWater(nx, y, nz, nd)) continue;
      if (this.isOceanColumn(x, z) && y <= this.world.seaLevelY) {
        this.setFluid(nx, y, nz, BLOCK.WATER);
        this.wake(nx, y, nz, nd);
        continue;
      }
      if (nd <= WATER_SPREAD_RANGE) {
        this.setFluid(nx, y, nz, BLOCK.WATER);
        this.wake(nx, y, nz, nd);
      }
    }
  }

  stepAir(x, y, z, spreadDist) {
    if (this.world.getBlock(x, y, z) !== BLOCK.AIR) return;
    if (this.shouldFillWater(x, y, z, spreadDist)) {
      this.setFluid(x, y, z, BLOCK.WATER);
      this.wake(x, y, z, spreadDist);
    }
  }

  tick(budget = 96) {
    let ops = 0;
    while (ops < budget && this.queue.size > 0) {
      const k = this.queue.values().next().value;
      this.queue.delete(k);
      const spreadDist = this.dist.get(k) ?? 0;
      this.dist.delete(k);

      const [x, y, z] = k.split(",").map(Number);
      if (!this.world.inBounds(x, y, z)) continue;

      const id = this.world.getBlock(x, y, z);
      if (id === BLOCK.WATER) {
        this.stepWater(x, y, z, spreadDist);
      } else if (id === BLOCK.AIR) {
        this.stepAir(x, y, z, spreadDist);
      }
      ops++;
    }
  }
}
