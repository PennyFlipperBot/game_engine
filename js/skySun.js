import * as THREE from "three";

/** Visible sun disc that stays in the sky relative to the player. */
export class SkySun {
  constructor(scene) {
    this.scene = scene;
    this.dir = new THREE.Vector3(0.52, 0.78, 0.34).normalize();
    this.distance = 240;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(9, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff0a8, fog: false })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(14, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.35,
        fog: false,
        depthWrite: false,
      })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(22, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.12,
        fog: false,
        depthWrite: false,
      })
    );

    this.group = new THREE.Group();
    this.group.add(halo);
    this.group.add(glow);
    this.group.add(core);
    this.group.renderOrder = -1;
    scene.add(this.group);
  }

  update(follow) {
    this.group.position.copy(follow).addScaledVector(this.dir, this.distance);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const child of this.group.children) {
      child.geometry.dispose();
      child.material.dispose();
    }
  }

  getLightPosition(target) {
    return target.copy(this.dir).multiplyScalar(120);
  }
}
