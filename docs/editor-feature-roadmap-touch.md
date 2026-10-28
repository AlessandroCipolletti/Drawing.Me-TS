## 5. Image import and floating reference card

Import from Photos / Files places a bitmap on a new layer at sensible size (fit within canvas bounds) and opens `resizeMode` for immediate placement. Decoding uses existing image utils and workers where possible to avoid blocking the main thread on large iPad photos. A separate **Reference** overlay is non-exportable: draggable, pinch-zoomable, semi-transparent card above the canvas for side-by-side reference. Long-press on reference samples color through the existing pipette loupe without switching tools permanently. Reference does not appear in layer export or merge-down unless explicitly “merge reference to layer.” Touch handles are large; reference sits outside the 120Hz stroke path until user interacts with it. Saves with project optional (flag) to keep file size down. Coworking may omit reference in v1 or sync as optional layer type.

---

## 9. Touch-scrub layer adjustments (HSB, curves, blur)

Non-destructive adjustment layer (preferred) or commit-on-confirm dialog for Hue/Saturation/Brightness, simple tone curve, and Gaussian blur on active layer or lasso selection. After opening adjustment, horizontal drag anywhere on canvas scrubs primary parameter; vertical optional for second param (e.g. saturation vs hue). Preview at 60–120 fps using downscaled proxy if full res is too slow; apply full res on release or “Done.” UI: minimal top chip showing param name and value, dismiss with tap outside or back gesture. History: one step per applied adjustment or live scrub merged on release. Clip masks recomposite display canvas after apply. Avoid per-frame UI framework work; only canvas and label text updates. Presets: “Softer,” “Sharpen,” “Warm” as one-tap starting points then scrub fine-tune.
