import { WORLD_PRESETS, CAMERA_PRESETS } from "./config.js";

/** Binds sidebar controls to engine callbacks. */
export class StudioUI {
  /**
   * @param {object} handlers
   * @param {(opts: object) => void} handlers.onWorldChange
   * @param {(mode: string) => void} handlers.onCameraChange
   * @param {(file: File) => Promise<void>} handlers.onAssetDrop
   * @param {(assetId: string) => void} handlers.onSpawnAsset
   * @param {() => void} handlers.onClearAssets
   * @param {(locked: boolean) => void} handlers.onPointerLock
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.els = {
      seed: document.getElementById("world-seed"),
      preset: document.getElementById("world-preset"),
      mountains: document.getElementById("world-mountains"),
      trees: document.getElementById("world-trees"),
      water: document.getElementById("world-water"),
      regen: document.getElementById("regen-world"),
      cameraGroup: document.getElementById("camera-presets"),
      dropZone: document.getElementById("asset-drop"),
      assetList: document.getElementById("asset-list"),
      clearAssets: document.getElementById("clear-assets"),
      overlay: document.getElementById("overlay"),
      crosshair: document.getElementById("crosshair"),
      hint: document.getElementById("controls-hint"),
      status: document.getElementById("status-text"),
    };
    this.selectedAssetId = null;
    this.cameraMode = "first-person";
    this.bind();
    this.renderCameraPresets();
    this.updateRangeLabels();
  }

  updateRangeLabels() {
    const mOut = document.getElementById("mountains-val");
    const tOut = document.getElementById("trees-val");
    if (mOut) mOut.textContent = Number(this.els.mountains.value).toFixed(2);
    if (tOut) tOut.textContent = Number(this.els.trees.value).toFixed(2);
  }

  bind() {
    const applyWorld = () => {
      this.handlers.onWorldChange(this.getWorldOptions());
    };

    this.els.regen.addEventListener("click", applyWorld);
    this.els.preset.addEventListener("change", () => {
      const preset = this.els.preset.value;
      const def = WORLD_PRESETS[preset];
      if (def) {
        this.els.mountains.value = def.mountains;
        this.els.trees.value = def.trees;
        this.els.water.checked = def.water;
      }
      applyWorld();
    });

    this.els.mountains.addEventListener("input", () => {
      this.updateRangeLabels();
      applyWorld();
    });
    this.els.trees.addEventListener("input", () => {
      this.updateRangeLabels();
      applyWorld();
    });
    this.els.water.addEventListener("change", applyWorld);

    document.getElementById("random-seed").addEventListener("click", () => {
      this.els.seed.value = String((Math.random() * 0x7fffffff) | 0);
      applyWorld();
    });

    this.els.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.els.dropZone.classList.add("dragover");
    });
    this.els.dropZone.addEventListener("dragleave", () => {
      this.els.dropZone.classList.remove("dragover");
    });
    this.els.dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      this.els.dropZone.classList.remove("dragover");
      const files = [...e.dataTransfer.files].filter((f) =>
        /\.(glb|gltf)$/i.test(f.name)
      );
      for (const file of files) {
        await this.handlers.onAssetDrop(file);
      }
    });

    this.els.dropZone.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".glb,.gltf";
      input.multiple = true;
      input.onchange = async () => {
        for (const file of input.files) {
          await this.handlers.onAssetDrop(file);
        }
      };
      input.click();
    });

    this.els.clearAssets.addEventListener("click", () => {
      this.handlers.onClearAssets();
      this.renderAssetList([]);
    });

    this.els.overlay.addEventListener("click", () => {
      this.handlers.onPointerLock(true);
    });
  }

  getWorldOptions() {
    const preset = this.els.preset.value;
    const def = WORLD_PRESETS[preset] ?? {};
    return {
      seed: Number(this.els.seed.value) || 1,
      preset,
      mountains: Number(this.els.mountains.value),
      trees: Number(this.els.trees.value),
      water: this.els.water.checked,
    };
  }

  renderCameraPresets() {
    this.els.cameraGroup.innerHTML = "";
    for (const [id, cfg] of Object.entries(CAMERA_PRESETS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn" + (id === this.cameraMode ? " active" : "");
      btn.textContent = cfg.label;
      btn.addEventListener("click", () => {
        this.cameraMode = id;
        this.renderCameraPresets();
        this.handlers.onCameraChange(id);
        this.updateCameraUI(id);
      });
      this.els.cameraGroup.appendChild(btn);
    }
  }

  updateCameraUI(mode) {
    const cfg = CAMERA_PRESETS[mode];
    this.els.crosshair.classList.toggle("visible", !!cfg?.crosshair);
    this.els.overlay.classList.toggle("hidden", !cfg?.pointerLock);
    this.els.hint.textContent =
      mode === "top-down"
        ? "Drag to orbit · WASD to move"
        : mode === "side-2d"
          ? "A/D to move · Space to jump"
          : "Click to play · WASD move · Space jump · Shift sprint";
  }

  renderAssetList(assets) {
    this.els.assetList.innerHTML = "";
    if (!assets.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "No assets yet — drop GLB files above.";
      this.els.assetList.appendChild(empty);
      return;
    }

    for (const asset of assets) {
      const row = document.createElement("div");
      row.className = "asset-row" + (asset.id === this.selectedAssetId ? " selected" : "");

      const name = document.createElement("span");
      name.className = "asset-name";
      name.textContent = asset.name;

      const spawn = document.createElement("button");
      spawn.type = "button";
      spawn.className = "small-btn";
      spawn.textContent = "Spawn";
      spawn.addEventListener("click", () => {
        this.selectedAssetId = asset.id;
        this.handlers.onSpawnAsset(asset.id);
        this.renderAssetList(assets);
      });

      row.appendChild(name);
      row.appendChild(spawn);
      this.els.assetList.appendChild(row);
    }
  }

  setStatus(text) {
    this.els.status.textContent = text;
  }

  setSeed(seed) {
    this.els.seed.value = String(seed);
  }
}
