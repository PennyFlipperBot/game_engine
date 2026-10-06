import * as THREE from "three";
import { WORLD_WIDTH, WORLD_HEIGHT, BLOCK, CHUNK_SIZE, CHUNK_RENDER_RADIUS } from "./config.js";

const WATER_UNIFORMS = () => ({
  uTime: { value: 0 },
  uDeep: { value: new THREE.Color(0x062035) },
  uMid: { value: new THREE.Color(0x1565a8) },
  uShallow: { value: new THREE.Color(0x4eb8e8) },
  uSun: { value: new THREE.Vector3(0.55, 0.85, 0.35).normalize() },
});

/** Underwater volume — side faces visible from shore. */
export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: WATER_UNIFORMS(),
    vertexShader: /* glsl */ `
      attribute float aIsTop;
      attribute float aDepth;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vDepth;
      uniform float uTime;

      void main() {
        vDepth = aDepth;
        vec3 pos = position;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uShallow;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vDepth;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.0);

        float depthMix = clamp(vDepth * 0.85 + 0.2, 0.0, 1.0);
        vec3 body = mix(uShallow, uMid, depthMix * 0.65);
        body = mix(body, uDeep, depthMix * 0.5);

        float caustic =
          sin(vWorldPos.x * 4.0 + uTime * 1.2) *
          sin(vWorldPos.z * 3.6 + uTime * 0.95) * 0.5 + 0.5;
        body += (caustic - 0.5) * 0.08;

        float alpha = clamp(0.62 + fresnel * 0.28, 0.62, 0.9);
        gl_FragColor = vec4(body, alpha);
      }
    `,
  });
}

/** Flat animated ocean top — readable from above and at a distance. */
export function createSeaSurfaceMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: WATER_UNIFORMS(),
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      uniform float uTime;

      void main() {
        vec3 pos = position;
        float wave =
          sin(pos.x * 2.4 + uTime * 1.35) * 0.05 +
          cos(pos.z * 2.1 + uTime * 1.1) * 0.045 +
          sin((pos.x + pos.z) * 3.2 + uTime * 0.85) * 0.03;
        pos.y += wave;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        vNormal = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = max(dot(N, V), 0.0);
        float fresnel = pow(1.0 - ndv, 3.0);

        vec3 body = mix(uShallow, uMid, 0.35);
        float caustic =
          sin(vWorldPos.x * 5.0 + uTime * 1.3) *
          sin(vWorldPos.z * 4.5 + uTime * 1.0) * 0.5 + 0.5;
        body += (caustic - 0.5) * 0.07;

        float sun = pow(max(dot(N, uSun), 0.0), 32.0);
        vec3 highlight = vec3(0.85, 0.96, 1.0) * sun * 0.45;
        vec3 foam = vec3(0.88, 0.97, 1.0);
        vec3 col = body + highlight;
        col = mix(col, foam, fresnel * 0.35);

        float alpha = clamp(0.9 + fresnel * 0.08, 0.9, 0.98);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

export function syncWaterTime(materials, tSec) {
  for (const m of materials) {
    if (m?.uniforms?.uTime) m.uniforms.uTime.value = tSec;
  }
}

/** Flat animated quads at global sea level. */
export class SeaSurface {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.material = createSeaSurfaceMaterial();
    /** @type {Map<string, THREE.Mesh>} */
    this.chunkMeshes = new Map();
    this.meshedKeys = new Set();
    this.focusChunk = null;
  }

  setFocusFromPosition(pos) {
    this.focusChunk = [
      Math.floor(pos.x / CHUNK_SIZE),
      Math.floor(pos.z / CHUNK_SIZE),
    ];
  }

  chunkCountX() {
    return Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
  }

  chunkCountZ() {
    return Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
  }

  keysInRenderRadius(fcx, fcz) {
    const keys = [];
    const maxCx = this.chunkCountX();
    const maxCz = this.chunkCountZ();
    const r = CHUNK_RENDER_RADIUS;
    const r2 = r * r + r;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r2) continue;
        const cx = fcx + dx;
        const cz = fcz + dz;
        if (cx < 0 || cz < 0 || cx >= maxCx || cz >= maxCz) continue;
        keys.push(`${cx},${cz}`);
      }
    }
    return keys;
  }

  updateTime(tSec) {
    syncWaterTime([this.material], tSec);
  }

  dispose() {
    for (const mesh of this.chunkMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunkMeshes.clear();
    this.meshedKeys.clear();
    this.material.dispose();
  }

  unloadChunk(key) {
    const mesh = this.chunkMeshes.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this.chunkMeshes.delete(key);
    this.meshedKeys.delete(key);
  }

  buildChunk(key) {
    this.unloadChunk(key);
    const [cx, cz] = key.split(",").map(Number);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const x1 = Math.min(WORLD_WIDTH, x0 + CHUNK_SIZE);
    const z1 = Math.min(WORLD_HEIGHT, z0 + CHUNK_SIZE);
    const { seaLevelY } = this.world;
    const y = seaLevelY + 1.001;
    const positions = [];
    const normals = [];

    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        if (this.world.getBlock(x, seaLevelY, z) !== BLOCK.WATER) continue;
        const verts = [
          [x, y, z],
          [x + 1, y, z],
          [x + 1, y, z + 1],
          [x, y, z + 1],
        ];
        const pushVert = (v) => {
          positions.push(v[0], v[1], v[2]);
          normals.push(0, 1, 0);
        };
        pushVert(verts[0]);
        pushVert(verts[1]);
        pushVert(verts[2]);
        pushVert(verts[0]);
        pushVert(verts[2]);
        pushVert(verts[3]);
      }
    }

    this.meshedKeys.add(key);
    if (positions.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.renderOrder = 8;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.chunkMeshes.set(key, mesh);
  }

  build() {
    if (!this.focusChunk) {
      this.setFocusFromPosition({ x: WORLD_WIDTH / 2, z: WORLD_HEIGHT / 2 });
    }
    const [fcx, fcz] = this.focusChunk;
    for (const key of this.keysInRenderRadius(fcx, fcz)) {
      this.meshedKeys.delete(key);
      this.buildChunk(key);
    }
  }

  updateStreaming() {
    if (!this.focusChunk) return;
    const [fcx, fcz] = this.focusChunk;
    const wanted = new Set(this.keysInRenderRadius(fcx, fcz));
    for (const key of [...this.chunkMeshes.keys()]) {
      if (!wanted.has(key)) this.unloadChunk(key);
    }
    for (const key of wanted) {
      if (!this.meshedKeys.has(key)) this.buildChunk(key);
    }
  }
}
