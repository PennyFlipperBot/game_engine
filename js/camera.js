import * as THREE from "three";
import { blockToWorld } from "./config.js";
import { PLAYER_HEIGHT } from "./player.js";

const _target = new THREE.Vector3();
const _body = new THREE.Vector3();
const _offset = new THREE.Vector3();

export class CameraRig {
  constructor(camera, player) {
    this.camera = camera;
    this.player = player;
    this.mode = "first-person";
    this.thirdPersonDistance = 5;
    this.topDownHeight = 40;
    this.topDownAngle = Math.PI / 4;
    this.orbitYaw = 0;
    this.orbitPitch = 0.3;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === "top-down" || mode === "side-2d") {
      this.orbitYaw = mode === "side-2d" ? 0 : Math.PI / 4;
      this.orbitPitch = mode === "side-2d" ? 0.15 : 0.9;
    }
  }

  update(dt) {
    this.player.getWorldPosition(_target);
    this.player.getBodyCenter(_body);

    switch (this.mode) {
      case "first-person":
        this.camera.position.copy(_target);
        this.camera.rotation.order = "YXZ";
        this.camera.rotation.y = this.player.yaw;
        this.camera.rotation.x = this.player.pitch;
        break;

      case "third-person": {
        const yaw = this.player.yaw;
        const pitch = Math.max(-0.4, Math.min(0.6, this.player.pitch));
        _offset.set(
          Math.sin(yaw) * Math.cos(pitch) * this.thirdPersonDistance,
          Math.sin(pitch) * this.thirdPersonDistance + blockToWorld(PLAYER_HEIGHT * 0.4),
          Math.cos(yaw) * Math.cos(pitch) * this.thirdPersonDistance
        );
        this.camera.position.copy(_body).add(_offset);
        this.camera.lookAt(_body);
        break;
      }

      case "top-down": {
        const dist = this.topDownHeight;
        _offset.set(
          Math.sin(this.orbitYaw) * dist * Math.cos(this.orbitPitch),
          Math.sin(this.orbitPitch) * dist,
          Math.cos(this.orbitYaw) * dist * Math.cos(this.orbitPitch)
        );
        this.camera.position.copy(_body).add(_offset);
        this.camera.lookAt(_body);
        break;
      }

      case "side-2d": {
        this.camera.position.set(_body.x, _body.y + blockToWorld(1), _body.z + 18);
        this.camera.lookAt(_body);
        break;
      }
    }
  }

  handleOrbitDrag(dx, dy) {
    if (this.mode !== "top-down") return;
    this.orbitYaw -= dx * 0.005;
    this.orbitPitch = Math.max(0.2, Math.min(1.2, this.orbitPitch + dy * 0.005));
  }
}
