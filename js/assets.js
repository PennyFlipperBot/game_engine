import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { blockToWorld } from "./config.js";
import { PLAYER_HEIGHT } from "./player.js";

/** Manages dropped GLB/GLTF assets and spawns them into the scene. */
export class AssetManager {
  constructor(scene, worldGroup) {
    this.scene = scene;
    this.worldGroup = worldGroup;
    this.loader = new GLTFLoader();
    /** @type {{ id: string, name: string, url: string, object: THREE.Object3D | null }[]} */
    this.library = [];
    /** @type {THREE.Object3D[]} */
    this.placed = [];
    this._idCounter = 0;
  }

  async addFromFile(file) {
    const url = URL.createObjectURL(file);
    const id = `asset-${++this._idCounter}`;
    const entry = { id, name: file.name.replace(/\.(glb|gltf)$/i, ""), url, object: null };
    this.library.push(entry);

    try {
      const gltf = await this.loader.loadAsync(url);
      entry.object = gltf.scene;
      entry.object.visible = false;
      this.scene.add(entry.object);
    } catch (err) {
      console.warn("Asset load failed:", file.name, err);
      entry.object = this.createPlaceholder(entry.name);
      this.scene.add(entry.object);
    }

    return entry;
  }

  createPlaceholder(label) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.6, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x6a8cff })
    );
    body.position.y = 0.8;
    group.add(body);
    group.userData.placeholder = true;
    group.userData.label = label;
    return group;
  }

  spawn(entryId, position, scale = 1) {
    const entry = this.library.find((a) => a.id === entryId);
    if (!entry || !entry.object) return null;

    const clone = entry.object.clone(true);
    clone.visible = true;
    clone.scale.setScalar(scale);
    clone.position.set(
      blockToWorld(position?.x ?? 0),
      blockToWorld(position?.y ?? 0),
      blockToWorld(position?.z ?? 0)
    );
    clone.userData.assetId = entryId;
    clone.userData.assetName = entry.name;
    this.worldGroup.add(clone);
    this.placed.push(clone);
    return clone;
  }

  spawnAtPlayer(entryId, player, scale = 1) {
    const yaw = player.yaw;
    return this.spawn(entryId, {
      x: player.position.x - Math.sin(yaw) * 2,
      y: player.position.y - PLAYER_HEIGHT,
      z: player.position.z - Math.cos(yaw) * 2,
    }, scale);
  }

  clearPlaced() {
    for (const obj of this.placed) {
      this.worldGroup.remove(obj);
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    }
    this.placed = [];
  }

  getLibrary() {
    return this.library.map(({ id, name }) => ({ id, name }));
  }
}
