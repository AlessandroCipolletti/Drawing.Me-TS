# Drawith.Me (`Drawing.Me-TS`)

**Drawith.Me** is a touch-first, real-time collaborative digital drawing and sketching web application built with **TypeScript** and **Vite**. Designed from the ground up for **iPad Safari (120Hz ProMotion & Apple Pencil)** as well as desktop and mobile browsers, it combines a low-latency 2D canvas stroke engine, a multi-layer compositor, peer-to-peer WebRTC coworking, and a geolocated world-map dashboard where drawings are pinned at a 1:1 physical scale (`1 px = 1 mm`).

---

## Key Features

- **120Hz High-Precision Stroke Engine**
  - Unified `PointerEvent` pipeline with `getCoalescedEvents()` support for ultra-smooth 120Hz Apple Pencil and stylus input on iPad Pro.
  - Full support for stylus **pressure**, **altitude (tilt)**, **azimuth**, and **stroke velocity** to dynamically modulate brush size, opacity, and stamp angle.
- **Rich Brush & Tool Suite**
  - **Pencil, Brush (11 custom stamp textures), Marker, Highlighter, Spray, Bucket (Web Worker flood-fill), Eraser, and Selection/Transform** tools.
  - Directional & constrained drawing modes for highlighters (freehand, horizontal, vertical, diagonal, perpendicular) and **specular symmetry** (horizontal and vertical mirroring).
  - Interactive **two-finger Ruler** with 45° magnetic angle snapping and edge-guided drawing.
- **Multi-Layer Compositor**
  - Per-layer opacity, visibility toggle, drag-and-drop reordering, duplication, merge-down, clear, and horizontal/vertical flip.
  - Blend modes (`source-over`, `source-atop`, `source-over-atop`) and 4 paper textures (_White_, _Lines_, _Squares_, _Points_).
  - Interactive bounding-box layer transform (move, scale with aspect-ratio lock, and rotate with angle snapping).
- **Real-Time Peer-to-Peer Coworking**
  - Direct device-to-device collaboration powered by **WebRTC (`PeerJS`)** using a simple 5-digit PIN code.
  - Deterministic stroke and spray-particle synchronization so both peers render pixel-identical strokes with isolated per-peer undo/redo histories.
- **GPS World Sheet Dashboard**
  - Places your drawings onto a shared WGS84 Mercator world sheet at **`1 px = 1 mm`** scale based on your device's GPS coordinates, complete with pan, pinch-to-zoom, and viewport caching.
- **Local-First IndexedDB Storage**
  - Powered by **Dexie (IndexedDB)** with a responsive two-phase save pipeline (instant thumbnail snapshot followed by non-blocking background layer serialization).

---

## Tech Stack

- **Language:** TypeScript (ES2022)
- **Bundler & Dev Server:** Vite 5
- **Rendering:** HTML5 Canvas 2D, `OffscreenCanvas`, Web Workers (`bucket`, `canvasContentCoords`, `fetchImgWorker`, `imgToBase64Worker`)
- **Networking:** PeerJS (WebRTC DataChannels)
- **Storage:** Dexie.js (IndexedDB)
- **Testing & Quality:** Vitest, TypeScript Compiler (`tsc`), ESLint 10, Prettier, Knip

---

## Getting Started (Run Locally)

### Prerequisites

- **Node.js** `>= 20` (v22+ recommended)
- **pnpm** `>= 9` (v10+ recommended)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start the Development Server

```bash
pnpm dev
```

Vite will start the local server at **`http://localhost:8080`**.

> **Tip — Testing on an iPad or Mobile Device:**
> Because `vite.config.ts` binds to `host: true` by default, you can open `http://<YOUR_LOCAL_IP>:8080` directly from Safari on an iPad connected to the same Wi-Fi network to test Apple Pencil pressure, tilt, and two-finger gestures.

### 3. Build & Preview Production Bundle

To typecheck and build the optimized production bundle in `dist/`:

```bash
pnpm build
```

To preview the production build locally:

```bash
pnpm preview
```

---

## Testing & Code Quality

### Run Unit Tests

Executes the Vitest test suite covering math utilities, the deterministic stroke/particle kernel, and WGS84 GPS coordinate projection:

```bash
pnpm test
```

### Individual Quality Checks

| Script          | Command              | Description                                                                 |
| :-------------- | :------------------- | :-------------------------------------------------------------------------- |
| **`typecheck`** | `pnpm run typecheck` | Runs `tsc --noEmit` to verify strict TypeScript types across the project.   |
| **`lint`**      | `pnpm run lint`      | Runs ESLint and `prettier --check .` to verify code quality and formatting. |
| **`lint:fix`**  | `pnpm run lint:fix`  | Automatically fixes ESLint issues and formats all files with Prettier.      |
| **`knip`**      | `pnpm run knip`      | Checks for unused files, unused dependencies, and dead exports with Knip.   |

### Run Full CI Check Suite

To run **Typecheck + ESLint & Prettier + Knip** sequentially (the exact same pipeline executed by GitHub Actions on every push/PR to `main`/`master`):

```bash
pnpm run ci
```

---

## Authors

Created by **Alessandro Cipolletti** and **Gaetano Saturno**.
