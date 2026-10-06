import * as THREE from "three";
import { VoxelWorld } from "./world.js";
import { ChunkMesher } from "./meshBuilder.js";
import { Player } from "./player.js";
import { CameraRig } from "./camera.js";
import { AssetManager } from "./assets.js";
import { StudioUI } from "./ui.js";
import { SeaSurface } from "./waterMaterial.js";
import { FluidSimulator } from "./fluid.js";
import { SkySun } from "./skySun.js";
import {
  VOXEL_SIZE,
  blockToWorld,
  CAMERA_PRESETS,
  FLUID_STEPS_PER_FRAME,
  FLUID_STEPS_HEAVY,
} from "./config.js";
import { newWorldSeed } from "./noise.js";

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setClearColor(0x6a8ab8);
renderer.sortObjects = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const FOG_CLEAR = new THREE.Color(0x7a9ec4);
const FOG_UNDERWATER = new THREE.Color(0x2a5080);
scene.fog = new THREE.Fog(FOG_CLEAR.getHex(), blockToWorld(48), blockToWorld(220));

const worldGroup = new THREE.Group();
worldGroup.scale.setScalar(VOXEL_SIZE);
scene.add(worldGroup);

const skyFollow = new THREE.Vector3();
const sunLightPos = new THREE.Vector3();

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sunLight = new THREE.DirectionalLight(0xfff0cc, 0.9);
scene.add(sunLight);
const skySun = new SkySun(scene);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
const player = new Player();
const cameraRig = new CameraRig(camera, player);

let world = null;
let mesher = null;
let seaSurface = null;
let fluids = null;
let assets = null;
let ui = null;
let cameraMode = "first-person";
let pointerLocked = false;
let orbitDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
};

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function buildWorld(opts) {
  if (seaSurface) seaSurface.dispose();
  if (mesher) mesher.dispose();

  world = new VoxelWorld(opts.seed, opts);
  fluids = new FluidSimulator(world);
  world.fluidSimulator = fluids;

  mesher = new ChunkMesher(world, worldGroup);
  mesher.setFocusFromPosition(world.spawn);
  mesher.updateStreaming(world.spawn.x, world.spawn.z);

  seaSurface = new SeaSurface(world, worldGroup);
  seaSurface.setFocusFromPosition(world.spawn);
  seaSurface.build();

  player.reset(world.spawn);
  ui.setSeed(world.seed);
  ui.setStatus(`World ready — seed ${world.seed}`);
}

function updateUnderwaterFog() {
  const target = player.inWater ? FOG_UNDERWATER : FOG_CLEAR;
  scene.fog.color.lerp(target, 0.08);
  if (player.inWater) {
    scene.fog.near = 8;
    scene.fog.far = 120;
  } else {
    scene.fog.near = blockToWorld(48);
    scene.fog.far = blockToWorld(220);
  }
}

function updateWorldStreaming(focusPos) {
  mesher?.setFocusFromPosition(focusPos);
  mesher?.updateStreaming(focusPos.x, focusPos.z);
  seaSurface?.setFocusFromPosition(focusPos);
  seaSurface?.updateStreaming();
}

function onWorldChange(opts) {
  buildWorld(opts);
  assets?.clearPlaced();
  ui.renderAssetList(assets?.getLibrary() ?? []);
}

function onCameraChange(mode) {
  cameraMode = mode;
  cameraRig.setMode(mode);
  ui.updateCameraUI(mode);

  if (CAMERA_PRESETS[mode]?.pointerLock && pointerLocked) {
    canvas.requestPointerLock();
  } else if (!CAMERA_PRESETS[mode]?.pointerLock) {
    document.exitPointerLock();
  }
}

async function onAssetDrop(file) {
  ui.setStatus(`Loading ${file.name}…`);
  await assets.addFromFile(file);
  ui.renderAssetList(assets.getLibrary());
  ui.setStatus(`Loaded ${file.name}`);
}

function onSpawnAsset(assetId) {
  assets.spawnAtPlayer(assetId, player, 1);
  ui.setStatus("Asset spawned in front of player");
}

function onClearAssets() {
  assets.clearPlaced();
  ui.setStatus("Cleared placed assets");
}

function onPointerLock(request) {
  if (!CAMERA_PRESETS[cameraMode]?.pointerLock) return;
  if (request) canvas.requestPointerLock();
}

function setupInput() {
  window.addEventListener("keydown", (e) => {
    switch (e.code) {
      case "KeyW": input.forward = true; break;
      case "KeyS": input.back = true; break;
      case "KeyA": input.left = true; break;
      case "KeyD": input.right = true; break;
      case "Space": input.jump = true; break;
      case "ShiftLeft":
      case "ShiftRight": input.sprint = true; break;
      case "Digit1": onCameraChange("first-person"); ui.cameraMode = "first-person"; ui.renderCameraPresets(); break;
      case "Digit2": onCameraChange("third-person"); ui.cameraMode = "third-person"; ui.renderCameraPresets(); break;
      case "Digit3": onCameraChange("top-down"); ui.cameraMode = "top-down"; ui.renderCameraPresets(); break;
      case "Digit4": onCameraChange("side-2d"); ui.cameraMode = "side-2d"; ui.renderCameraPresets(); break;
    }
  });

  window.addEventListener("keyup", (e) => {
    switch (e.code) {
      case "KeyW": input.forward = false; break;
      case "KeyS": input.back = false; break;
      case "KeyA": input.left = false; break;
      case "KeyD": input.right = false; break;
      case "Space": input.jump = false; break;
      case "ShiftLeft":
      case "ShiftRight": input.sprint = false; break;
    }
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === canvas;
    ui.els.overlay.classList.toggle("hidden", pointerLocked || !CAMERA_PRESETS[cameraMode]?.pointerLock);
  });

  canvas.addEventListener("mousedown", (e) => {
    if (cameraMode === "top-down" && e.button === 0 && !pointerLocked) {
      orbitDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  });

  window.addEventListener("mouseup", () => {
    orbitDragging = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (pointerLocked && (cameraMode === "first-person" || cameraMode === "third-person")) {
      player.yaw -= e.movementX * 0.002;
      player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - e.movementY * 0.002));
      return;
    }
    if (orbitDragging && cameraMode === "top-down") {
      cameraRig.handleOrbitDrag(e.clientX - lastMouseX, e.clientY - lastMouseY);
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  });

  window.addEventListener("resize", resize);
  new ResizeObserver(resize).observe(canvas.parentElement);
}

let lastTime = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const tSec = now * 0.001;
  const simActive =
    pointerLocked &&
    (cameraMode === "first-person" || cameraMode === "third-person");

  if (world && mesher) {
    player.moveWithCollision(world, dt, input, input.sprint, cameraMode);
    cameraRig.update(dt);
    updateUnderwaterFog();

    const focusPos = player.position;
    updateWorldStreaming(focusPos);

    if (fluids && simActive) {
      const fluidSteps =
        fluids.queue.size > 400 ? FLUID_STEPS_HEAVY : FLUID_STEPS_PER_FRAME;
      fluids.tick(fluidSteps);
      if (fluids.needsSeaRebuild) {
        seaSurface?.build();
        fluids.needsSeaRebuild = false;
      }
    }

    mesher.rebuildDirty(3);
    mesher.updateTime(tSec);
    seaSurface?.updateTime(tSec);
  }

  skyFollow.copy(player.position);
  skyFollow.set(blockToWorld(skyFollow.x), blockToWorld(skyFollow.y), blockToWorld(skyFollow.z));
  skySun.update(skyFollow);
  skySun.getLightPosition(sunLightPos);
  sunLight.position.copy(sunLightPos);

  renderer.render(scene, camera);
}

function init() {
  assets = new AssetManager(scene, worldGroup);
  ui = new StudioUI({
    onWorldChange,
    onCameraChange,
    onAssetDrop,
    onSpawnAsset,
    onClearAssets,
    onPointerLock,
  });

  setupInput();
  resize();

  buildWorld({ ...ui.getWorldOptions(), seed: newWorldSeed() });
  ui.updateCameraUI(cameraMode);
  ui.renderAssetList([]);

  tick(performance.now());
}

init();
