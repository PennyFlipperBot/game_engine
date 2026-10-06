import * as THREE from "three";
import { WORLD_WIDTH, WORLD_HEIGHT, blockToWorld } from "./config.js";

const GRAVITY = 28;
const WALK_SPEED = 5.2;
const SPRINT_MULT = 1.55;
const JUMP_V = 9.5;
const SWIM_SPEED = 3.1;
const SWIM_UP = 5.5;
const SWIM_SINK = 5.0;
const SWIM_GRAVITY = 12;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_RADIUS = 0.35;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER_TIME = 0.14;
const GROUND_PROBE = 0.08;

export class Player {
  constructor() {
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0;
    /** Eye height in block units (same convention as Deadzone). */
    this.position = new THREE.Vector3();
    this.coyoteSec = 0;
    this.jumpBufferSec = 0;
    this.inWater = false;
  }

  reset(spawn) {
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.coyoteSec = 0;
    this.jumpBufferSec = 0;
    this.onGround = false;
    this.inWater = false;
  }

  queueJump() {
    this.jumpBufferSec = JUMP_BUFFER_TIME;
  }

  probeInWater(world) {
    const x0 = Math.floor(this.position.x - PLAYER_RADIUS + 0.01);
    const x1 = Math.floor(this.position.x + PLAYER_RADIUS - 0.01);
    const z0 = Math.floor(this.position.z - PLAYER_RADIUS + 0.01);
    const z1 = Math.floor(this.position.z + PLAYER_RADIUS - 0.01);
    const bodyYs = [
      Math.floor(this.position.y - 0.35),
      Math.floor(this.position.y - PLAYER_HEIGHT * 0.55),
      Math.floor(this.position.y - PLAYER_HEIGHT + 0.25),
    ];
    for (const y of bodyYs) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (world.isWater(world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  probeGround(world) {
    if (this.inWater) return false;
    const footY = this.position.y - PLAYER_HEIGHT;
    const x0 = Math.floor(this.position.x - PLAYER_RADIUS + 0.01);
    const x1 = Math.floor(this.position.x + PLAYER_RADIUS - 0.01);
    const z0 = Math.floor(this.position.z - PLAYER_RADIUS + 0.01);
    const z1 = Math.floor(this.position.z + PLAYER_RADIUS - 0.01);
    const probeY = Math.floor(footY - GROUND_PROBE);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (world.isSolid(world.getBlock(x, probeY, z))) return true;
      }
    }
    return false;
  }

  moveWithCollision(world, dt, input, sprint, cameraMode = "first-person") {
    this.inWater = this.probeInWater(world);
    const inFluid = this.inWater;

    const speedBase = inFluid ? SWIM_SPEED : WALK_SPEED;
    const speed = speedBase * (sprint && !inFluid ? SPRINT_MULT : 1);

    const wish = new THREE.Vector3();

    if (cameraMode === "side-2d") {
      if (input.forward) wish.x += speed;
      if (input.back) wish.x -= speed;
    } else {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (input.forward) wish.add(forward);
      if (input.back) wish.sub(forward);
      if (input.right) wish.add(right);
      if (input.left) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    }

    this.velocity.x = wish.x;
    this.velocity.z = wish.z;

    if (input.jump) this.queueJump();
    if (this.jumpBufferSec > 0) this.jumpBufferSec = Math.max(0, this.jumpBufferSec - dt);

    if (inFluid) {
      this.velocity.y -= SWIM_GRAVITY * dt;
      if (this.velocity.y < -SWIM_SINK) this.velocity.y = -SWIM_SINK;
      if (input.jump || this.jumpBufferSec > 0) {
        this.velocity.y = SWIM_UP;
        this.jumpBufferSec = 0;
      }
    } else {
      const groundedBefore = this.onGround || this.probeGround(world);
      if (groundedBefore) {
        this.coyoteSec = COYOTE_TIME;
      } else {
        this.coyoteSec = Math.max(0, this.coyoteSec - dt);
      }

      const canJump = groundedBefore || this.coyoteSec > 0;
      if (canJump && this.velocity.y <= 0) {
        this.velocity.y = 0;
        if (this.jumpBufferSec > 0) {
          this.velocity.y = JUMP_V;
          this.jumpBufferSec = 0;
          this.coyoteSec = 0;
          this.onGround = false;
        }
      } else {
        this.velocity.y -= GRAVITY * dt;
      }
    }

    this.onGround = false;
    this.resolveAxis(world, "x", this.velocity.x * dt);
    this.resolveAxis(world, "y", this.velocity.y * dt);
    this.resolveAxis(world, "z", this.velocity.z * dt);

    if (!inFluid && !this.onGround) {
      this.onGround = this.probeGround(world) && this.velocity.y <= 0.01;
    }

    this.clampToWorld();
  }

  resolveAxis(world, axis, delta) {
    if (delta === 0) return;
    const prevFeetY = this.position.y - PLAYER_HEIGHT;
    this.position[axis] += delta;
    const min = this.aabbMin();
    const max = this.aabbMax();

    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        for (let z = min.z; z <= max.z; z++) {
          if (!world.isSolid(world.getBlock(x, y, z))) continue;
          this.resolveBlock(axis, delta, x, y, z, prevFeetY);
        }
      }
    }
  }

  aabbMin() {
    return {
      x: Math.floor(this.position.x - PLAYER_RADIUS),
      y: Math.floor(this.position.y - PLAYER_HEIGHT),
      z: Math.floor(this.position.z - PLAYER_RADIUS),
    };
  }

  aabbMax() {
    return {
      x: Math.floor(this.position.x + PLAYER_RADIUS),
      y: Math.floor(this.position.y + 0.1),
      z: Math.floor(this.position.z + PLAYER_RADIUS),
    };
  }

  resolveBlock(axis, delta, bx, by, bz, prevFeetY) {
    const minX = this.position.x - PLAYER_RADIUS;
    const maxX = this.position.x + PLAYER_RADIUS;
    const minY = this.position.y - PLAYER_HEIGHT;
    const maxY = this.position.y;
    const minZ = this.position.z - PLAYER_RADIUS;
    const maxZ = this.position.z + PLAYER_RADIUS;

    const bMinX = bx;
    const bMaxX = bx + 1;
    const bMinY = by;
    const bMaxY = by + 1;
    const bMinZ = bz;
    const bMaxZ = bz + 1;

    if (maxX <= bMinX || minX >= bMaxX) return;
    if (maxY <= bMinY || minY >= bMaxY) return;
    if (maxZ <= bMinZ || minZ >= bMaxZ) return;

    if (axis === "x") {
      if (delta > 0) this.position.x = bMinX - PLAYER_RADIUS - 1e-4;
      else this.position.x = bMaxX + PLAYER_RADIUS + 1e-4;
      this.velocity.x = 0;
    } else if (axis === "z") {
      if (delta > 0) this.position.z = bMinZ - PLAYER_RADIUS - 1e-4;
      else this.position.z = bMaxZ + PLAYER_RADIUS + 1e-4;
      this.velocity.z = 0;
    } else {
      if (delta > 0) {
        this.position.y = bMinY - 1e-4;
        this.velocity.y = 0;
      } else {
        const feetWereAbove = prevFeetY >= bMaxY - 0.15;
        if (!feetWereAbove) return;
        this.position.y = bMaxY + PLAYER_HEIGHT;
        this.velocity.y = 0;
        this.onGround = !this.inWater;
      }
    }
  }

  clampToWorld() {
    this.position.x = Math.max(1, Math.min(WORLD_WIDTH - 1, this.position.x));
    this.position.z = Math.max(1, Math.min(WORLD_HEIGHT - 1, this.position.z));
    if (this.position.y < -12) {
      this.velocity.set(0, 0, 0);
      this.position.y = 24;
    }
  }

  getWorldPosition(out) {
    out.set(
      blockToWorld(this.position.x),
      blockToWorld(this.position.y),
      blockToWorld(this.position.z)
    );
    return out;
  }

  getBodyCenter(out) {
    out.set(
      blockToWorld(this.position.x),
      blockToWorld(this.position.y - PLAYER_HEIGHT * 0.45),
      blockToWorld(this.position.z)
    );
    return out;
  }
}
