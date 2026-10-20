# Architecture & 120Hz Boundaries (`Drawing.Me-TS`)

## Core Rule: Canvas Hot Path !== UI JSX

Drawith.Me targets **120Hz ProMotion** on iPad Pro with Apple Pencil (`PointerEvent` + `getCoalescedEvents()`).

To guarantee zero frame drops during active strokes:

1. **No per-frame UI rendering:** The UI layer uses lightweight vanilla JSX (`src/ui/jsx-runtime.ts` + `src/ui/mount.ts`) that creates native DOM nodes **once** on mount. No Virtual DOM diffing or component re-render ever runs inside `pointermove`, `requestAnimationFrame` stroke loops, or multi-touch gesture ticks.
2. **Strict Layer Separation:**
   - **UI Views (`*View.tsx`):** Pure, typed JSX markup returning native `HTMLElement`s with existing BEM classes (`drawith__*`, `folder__*`, `editor__*`, etc.). Zero imports from the stroke engine.
   - **Page / Panel Controllers:** Event-driven state transitions (clicks, taps, DB queries, PeerJS events). Updates DOM attributes/classes directly or replaces subtrees only on user-initiated UI events.
   - **App Services (`src/app/`, `src/modules/`):** Typed navigation, shell state, Coworking event bus, and Dexie persistence without circular dependencies.
   - **Stroke & Gesture Engine (`canvasUtils.ts`, `pointerEventsUtils/`, `editorUtils.ts`, Web Workers):** Direct imperative 2D canvas and pointer state machine.

---

## Editor Module Map & Forbidden Imports

```
src/pages/Editor/
├── Editor.ts                   # Thin orchestrator: open/close, initSubModules, registerEditorFacade, pointer wiring
├── EditorView.tsx              # Pure JSX DOM shell (no imports from editorUtils or canvasUtils)
├── editorTypes.ts              # Typed EditorState, EditorTouchState, EditorCanvasState, CurrentToolProps
├── editorFacade.ts             # Narrow contract used by Toolbar, Tools, Layers, ColorPicker
├── editorPointerRouter.ts      # Pure touchStart/touchMove/touchEnd dispatch & ruler near-touch routing
├── editorStrokeSession.ts      # Active stroke lifecycle, coalesced PointerEvent loop, line adaptation
├── editorViewport.ts           # 2-finger pinch/zoom/rotate/pan & canvas sizing
├── editorCompositor.ts         # Layer stack DOM/context sync & drag/resize box
├── editorLifecycle.ts          # Fullscreen, keyboard shortcuts, pipette loupe
├── editorPersistence.ts        # Draft intervals, two-phase Dexie save, palette persistence
├── editorCoworkingBridge.ts    # Compact array serialization & single-painter remote step playback
├── editorUtils.ts              # 120Hz stroke math & StrokeSample builder (frozen hot path)
└── components/
    ├── Toolbar/                # Top bar & RAF-coalesced brush size/alpha preview
    ├── Tools/                  # Scrollable brush rail & per-version custom props
    ├── ColorPicker/            # Swatch rail, brightness slider, drag-reorder, random/pipette
    ├── Ruler/                  # 2-finger ruler transform, snap/lock, perpendicular/specular
    └── Layers/                 # Decomposed into state, history, export, coworking, list UI, & thin index
```

### Forbidden Import Rules

- `*View.tsx` files **must never** import from `editorUtils.ts`, `canvasUtils.ts`, `pointerEventsUtils/`, or `Editor.ts`.
- Chrome panels (`Toolbar`, `Tools`, `Layers`, `ColorPicker`, `Ruler`) **must never** `import * as Editor` — all editor commands go through `editorFacade.ts` or callbacks passed at `init()`.
- No DOM creation (`document.createElement`, `mount`, `replaceChildren`) is permitted inside `editorStrokeSession.ts`, `editorUtils.ts`, or `canvasUtils.ts` during `move` phases.

---

## iPad Pro (120Hz & Apple Pencil) Milestone Checklist

Run `pnpm dev` and open `http://<LOCAL_IP>:5173` on iPad Safari before closing each migration phase:

- [ ] **Shell & Navigation:** Burger menu opens/closes smoothly; navigating between Folder, World GPS Sheet (`Dashboard`), and About (`Info`) leaves no orphan DOM nodes or listeners.
- [ ] **Folder & Two-Phase Save:** Creating a drawing, drawing a complex stroke, and tapping Back shows the drawing immediately in Folder; the card spinner stays visible until background layer serialization completes.
- [ ] **Folder Select / Export / Coworking PIN:** Long-press or Select toggles selection mode; Export opens the white/transparent share popup; "Draw with a friend" opens the PIN URL popup and copies/shares on double-tap.
- [ ] **Editor Chrome:** Toolbar Size/Alpha sliders coalesce preview canvas updates via `requestAnimationFrame`; Tools rail scrolls (>10px drag) and opens tool versions; ColorPicker swatches, brightness slider, and drag-reorder work; Layers panel reorder, opacity, merge, and visibility toggles work.
- [ ] **120Hz Stroke Engine:** Apple Pencil starts at 0ms latency (no 40ms finger gesture delay), palm rejection ignores stray touches during active stylus strokes, 2-finger pinch/rotate/pan and 2/3/4-finger undo/redo/fullscreen taps respond identically to `PARITY.md`.
