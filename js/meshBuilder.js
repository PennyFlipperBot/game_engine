import * as THREE from "three";
import {
  BLOCK,
  BLOCK_COLORS,
  CHUNK_SIZE,
  CHUNK_RENDER_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_MAX_Y,
} from "./config.js";
import { createWaterMaterial } from "./waterMaterial.js";

const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], isTop: true },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

const FACE_SHADE = [0.82, 0.86, 1.08, 0.62, 0.88, 0.72];

function shadeColor(rgb, factor) {
  return [
    Math.min(255, Math.floor(rgb[0] * factor)),
    Math.min(255, Math.floor(rgb[1] * factor)),
    Math.min(255, Math.floor(rgb[2] * factor)),
  ];
}

/** Subtle per-face tint so flat terrain reads as smaller voxels. */
function blockColorVariation(x, y, z, faceIndex) {
  const h =
    (Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 2147483647) ^
      Math.imul(faceIndex + 1, 127)) >>>
    0;
  return 0.9 + ((h & 255) / 255) * 0.14;
}

function shouldDrawFace(world, id, neighbor) {
  if (neighbor === id && id === BLOCK.WATER) return false;
  if (world.isOpaque(neighbor)) return false;
  return true;
}

function pushQuad(positions, colors, normals, verts, shaded, faceNormal) {
  const pushVert = (v) => {
    positions.push(v[0], v[1], v[2]);
    colors.push(shaded[0] / 255, shaded[1] / 255, shaded[2] / 255);
    normals.push(faceNormal[0], faceNormal[1], faceNormal[2]);
  };
  pushVert(verts[0]);
  pushVert(verts[1]);
  pushVert(verts[2]);
  pushVert(verts[0]);
  pushVert(verts[2]);
  pushVert(verts[3]);
}

function pushWaterQuad(positions, normals, isTopArr, depthArr, topFlag, depthNorm, verts, faceNormal) {
  const pushVert = (v) => {
    positions.push(v[0], v[1], v[2]);
    normals.push(faceNormal[0], faceNormal[1], faceNormal[2]);
    isTopArr.push(topFlag ? 1 : 0);
    depthArr.push(depthNorm);
  };
  pushVert(verts[0]);
  pushVert(verts[1]);
  pushVert(verts[2]);
  pushVert(verts[0]);
  pushVert(verts[2]);
  pushVert(verts[3]);
}

export class ChunkMesher {
  constructor(world, parentGroup) {
    this.world = world;
    this.parentGroup = parentGroup;
    /** @type {Map<string, THREE.Mesh>} */
    this.meshes = new Map();
    /** @type {Map<string, THREE.Mesh>} */
    this.waterMeshes = new Map();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: true,
    });
    this.waterMaterial = createWaterMaterial();
    this.focusChunk = null;
    this.meshedKeys = new Set();
  }

  dispose() {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      this.parentGroup.remove(mesh);
    }
    for (const mesh of this.waterMeshes.values()) {
      mesh.geometry.dispose();
      this.parentGroup.remove(mesh);
    }
    this.meshes.clear();
    this.waterMeshes.clear();
    this.meshedKeys.clear();
    this.material.dispose();
    this.waterMaterial.dispose();
  }

  setFocusFromPosition(pos) {
    this.focusChunk = [
      Math.floor(pos.x / CHUNK_SIZE),
      Math.floor(pos.z / CHUNK_SIZE),
    ];
  }

  updateTime(tSec) {
    if (this.waterMaterial.uniforms?.uTime) {
      this.waterMaterial.uniforms.uTime.value = tSec;
    }
  }

  rebuildDirty(limit = 3) {
    let count = 0;
    for (const key of [...this.world.dirtyChunks]) {
      if (count >= limit) break;
      this.world.dirtyChunks.delete(key);
      this.buildChunk(key);
      this.meshedKeys.add(key);
      count++;
    }
  }

  updateStreaming(focusX, focusZ) {
    this.setFocusFromPosition({ x: focusX, z: focusZ });
    const chunkX = Math.floor(focusX / CHUNK_SIZE);
    const chunkZ = Math.floor(focusZ / CHUNK_SIZE);
    const r = CHUNK_RENDER_RADIUS;
    const r2 = r * r + r;

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r2) continue;
        const cx = chunkX + dx;
        const cz = chunkZ + dz;
        if (cx < 0 || cz < 0) continue;
        if (cx * CHUNK_SIZE >= WORLD_WIDTH || cz * CHUNK_SIZE >= WORLD_HEIGHT) continue;
        const key = this.world.chunkKey(cx, cz);
        if (!this.meshedKeys.has(key) || this.world.dirtyChunks.has(key)) {
          this.world.dirtyChunks.add(key);
        }
      }
    }

    for (const key of [...this.meshes.keys(), ...this.waterMeshes.keys()]) {
      const [cx, cz] = key.split(",").map(Number);
      const dx = cx - chunkX;
      const dz = cz - chunkZ;
      if (dx * dx + dz * dz > (r + 1) * (r + 1) + r) {
        this.unloadChunk(key);
      }
    }
  }

  unloadChunk(key) {
    const solid = this.meshes.get(key);
    if (solid) {
      solid.geometry.dispose();
      this.parentGroup.remove(solid);
      this.meshes.delete(key);
    }
    const water = this.waterMeshes.get(key);
    if (water) {
      water.geometry.dispose();
      this.parentGroup.remove(water);
      this.waterMeshes.delete(key);
    }
    this.meshedKeys.delete(key);
  }

  buildChunk(key) {
    const existing = this.meshes.get(key);
    if (existing) {
      existing.geometry.dispose();
      this.parentGroup.remove(existing);
      this.meshes.delete(key);
    }
    const existingWater = this.waterMeshes.get(key);
    if (existingWater) {
      existingWater.geometry.dispose();
      this.parentGroup.remove(existingWater);
      this.waterMeshes.delete(key);
    }

    const [cx, cz] = key.split(",").map(Number);
    const positions = [];
    const colors = [];
    const normals = [];
    const wPositions = [];
    const wNormals = [];
    const wIsTop = [];
    const wDepth = [];

    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const x1 = Math.min(WORLD_WIDTH, x0 + CHUNK_SIZE);
    const z1 = Math.min(WORLD_HEIGHT, z0 + CHUNK_SIZE);
    const seaY = this.world.seaLevelY;

    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        for (let y = 0; y < WORLD_MAX_Y; y++) {
          const id = this.world.getBlock(x, y, z);
          if (id === BLOCK.AIR) continue;
          const depthNorm = Math.min(1, y / 22);

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighbor = this.world.getBlock(nx, ny, nz);
            if (!shouldDrawFace(this.world, id, neighbor)) continue;

            const verts = face.corners.map(([ox, oy, oz]) => [x + ox, y + oy, z + oz]);

            if (id === BLOCK.WATER) {
              if (face.isTop && y === seaY) continue;
              pushWaterQuad(
                wPositions,
                wNormals,
                wIsTop,
                wDepth,
                !!face.isTop,
                depthNorm,
                verts,
                face.dir
              );
              continue;
            }

            const rgb = BLOCK_COLORS[id];
            if (!rgb) continue;
            const shaded = shadeColor(
              rgb,
              FACE_SHADE[fi] * blockColorVariation(x, y, z, fi)
            );
            pushQuad(positions, colors, normals, verts, shaded, face.dir);
          }
        }
      }
    }

    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.frustumCulled = true;
      this.parentGroup.add(mesh);
      this.meshes.set(key, mesh);
    }

    if (wPositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(wPositions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(wNormals, 3));
      geometry.setAttribute("aIsTop", new THREE.Float32BufferAttribute(wIsTop, 1));
      geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(wDepth, 1));
      const mesh = new THREE.Mesh(geometry, this.waterMaterial);
      mesh.frustumCulled = true;
      mesh.renderOrder = 2;
      this.parentGroup.add(mesh);
      this.waterMeshes.set(key, mesh);
    }
  }
}
