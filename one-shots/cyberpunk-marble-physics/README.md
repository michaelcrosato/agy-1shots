# Cyberpunk Marble-Physics Sandbox Game

A modular, performant 3D Cyberpunk Marble-Physics Rogue-lite sandbox game. It runs entirely in the browser using Three.js, `@dimforge/rapier3d-compat` (WASM physics), and Vite.

## Architecture Highlights

- **Decoupled Physics Loop**: A deterministic physics loop runs at a fixed 60Hz (`PHYSICS_DT = 1/60`).
- **Smooth Rendering Interpolation**: Uses a residual accumulator variable (`alpha`) to interpolate between past and current physics states, eliminating stutter.
- **Board Tilt Gravity**: User WASD / Arrow keys, mouse drag vectors, or accelerometer data map dynamically to gravity vector coordinates (max board tilt = 15°).
- **Optimized Rendering**: InstancedMesh blocks for generating neon cyberpunk tracks, with distance-modulated custom PBR & neon glow shaders.

---

## Quick Start

### 1. Prerequisites

- Node.js (version 18 or above recommended)
- Windows / macOS / Linux

### 2. Setup

Navigate to the directory and install local dependencies:

```bash
cd one-shots/cyberpunk-marble-physics
npm install
```

### 3. Execution Scripts

- **Start Development Server**: Runs local dev site on `http://localhost:5173`.
  ```bash
  npm run start
  ```
- **Compile Production Bundle**: Bundles the code and copies WASM to `dist/`.
  ```bash
  npm run build
  ```
- **Preview Production Bundle**: Locally hosts the `dist/` directory.
  ```bash
  npm run preview
  ```
- **Run Unit Tests**: Validates physics loop accumulators and controller equations.
  ```bash
  npm run test
  ```
- **Run Acceptance Verification**: Runs programmatic verify tests.
  ```bash
  npm run verify
  ```

---

## Configuration Details

- **WASM Copier**: `vite.config.js` utilizes `vite-plugin-static-copy` to copy the WebAssembly asset from `node_modules` into the distribution output.
- **Windows compatibility**: Vite dev server employs an override plugin to explicitly serve `.wasm` with `application/wasm` MIME-type to bypass Windows registry issues.
