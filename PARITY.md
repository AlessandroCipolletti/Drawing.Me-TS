# Drawith.Me — Feature Parity Checklist (`Drawing.Me-TS`)

Every item below is mandatory in the new TypeScript + Vite rewrite. Nothing in `/Users/cippo/Workspace/Me/Drawith.Me-light` is modified.

## Shell

- [x] Burger menu that opens and closes over the current page (`Header.js`, `main.js`)
- [x] Pages: folder (default), editor, coworking join (`?S=` / `/coworking/requestSession/:id`), info (`/info/aboutUs`), GPS dashboard (`/dashboard`), and unsupported-device page (`/notsupported`)
- [x] Device classes on the document (`drawith__MOBILE`, `drawith__PHONE`, `drawith__TABLET`, `drawith__DESKTOP`, `drawith__IOS`, `drawith__IPAD`, `drawith__IPHONE`, `drawith__ANDROID`)
- [x] Locked viewport, `viewport-fit=cover`, and retina scale from `initViewportTryPixelPerfect`
- [x] Home-screen standalone manifest (`display: standalone`), `apple-mobile-web-app-capable`, black status bar, app icons (no service worker)
- [x] Resize and rotation, including iPad split view, handled once when both events fire
- [x] Warning before leaving a page with unsaved editor changes (`beforeunload`)
- [x] Toast, confirm, text input, and error dialogs (`Messages`)
- [x] Block unsupported clients: old iOS, Android outside Chrome, IE, smart TV, wearable, console, Windows Phone

## Original art files

- [x] Tool icons and UI icons in `static/icons/`
- [x] Brush stamps `brush-1.png` through `brush-11.png` and highlighter stamps `highlighter-h.png`, `highlighter-l.png`, `highlighter-r.png`, `highlighter-v.png`
- [x] Papers `white.png`, `squares.png`, `lines.png`, `points.png`, plus editor background, ruler ticks, folder card images, logo, and about-page drawing
- [x] App icons named in `manifest.webmanifest`

## Folder

- [x] Create a new drawing
- [x] Start a shared session ("draw with a friend"), with an offline state when there is no peer
- [x] Popup with the session id, tap to copy (double-tap within 250 ms or desktop shows "Copied"), and share instructions (`navigator.share` on touch devices)
- [x] List saved drawings, newest first, and open one
- [x] Select mode, including long-press to select, then Done
- [x] Delete the selection after a confirm
- [x] Export the selection with a white background, or with no background
- [x] Show a spinner while a drawing is still saving (without the double-spinner flicker bug)

## Editor buttons

- [x] Tool rail top to bottom: `marker`, `pencil` (2H, HB, 2B), `highlighter` (right, left), `brush` (1–5 with stamp images), `hardBrush` (6–11 with stamp images), `spray`, `bucket`, `eraser`, `ruler`, `undo`, `redo`, `paper` (cycles white, squares, lines, points, showing next paper icon), `clear`
- [x] Shared rail behavior: scrollable rail (>10 px drag is scroll, not tap), version row toggles and auto-closes after 7s or on stroke/pinch/tool change, per-version custom size/alpha persisted, selecting a tool leaves layer resize mode, last writing tool remembered for pipette return
- [x] Top toolbar: Back (saves and returns to folder), Size button (tap opens slider, horizontal drag changes size directly, 7s auto-close, live stroke preview on popup canvas, logarithmic curve), Alpha button (same interaction, steeper logarithmic curve), Save a copy (enabled after modification), Fullscreen toggle (also 4-finger tap)
- [x] Color bar: Native color input (inserts at front), Pipette button (toggles pipette loupe, returns to previous brush/color), Random mode (default on new drawing, new random hex per stroke except eraser, tapping Random again confirms last random color into palette), 27 initial swatches + custom drawing palette, horizontal scroll + long-press drag reorder, swatch panel with Brightness slider (0–100%), 6 Suggested colors (spun hues), Delete swatch (falls back to random), provisional added color confirmed on stroke/swatch tap/pipette
- [x] Layer panel buttons: Add layer, Layer row (thumbnail cropped to content, edit mark on selected, user mark on coworker's layer, tap to select, drag to reorder), Layer options (hidden on coworker's layer), Show/hide, Rename (max 12 chars), Flip horizontal, Flip vertical, Duplicate, Merge down, Send to friend (confirm first), Delete layer (confirm first), Opacity slider, Resize mode button (8 scale handles + rotation handle)
- [x] Ruler buttons: Perpendicular (rotate 90°) and Specular (mirror), plus angle readout in degrees

## Brushes and how a stroke is built

- [x] Single numeric `StrokeSample` painter (`drawStrokeSample`) shared by local Pointer Events and remote peer steps
- [x] Stamp types: filled circle, rectangular particles, circular particles, spray circle, image stamp tinted with current color
- [x] Marker: circle, size 2–400, `sizeForceFactor` 0.3, `alphaForceFactor` 0.075, alpha 0.003–0.24, `sizeToFramesRatio` 1/40
- [x] Pencil (no size/alpha slider): 2H (rect particles, size 2–8, `sizeAltitudeFactor` 3, alpha 0.06–0.3), HB (circle particles, size 3–10, `sizeAltitudeFactor` 1.5, alpha 0.06–0.25), 2B (circle particles, size 3–9, `sizeForceFactor` 1, alpha 0.1–0.4, min 2 px distance)
- [x] Highlighter: image stamp, right/left (h/v on touch), size 15–200, `sizeAltitudeFactor` 3, alpha 0.01–0.5, stylus rotation
- [x] Brush: image stamps 1–5, size 6–100, `sizeForceFactor` 3, `sizeAltitudeFactor` 2, alpha 0.003–0.5, stylus rotation
- [x] Hard brush: image stamps 6–11, size 10–100, `sizeForceFactor` 1, `sizeSpeedFactor` 0.4, `sizeAltitudeFactor` 4, alpha 0.003–0.11, stylus rotation
- [x] Spray: spray-circle stamp, default 50, range 10–250, minAlpha 0.04, `alphaForceFactor` 0.5, no curve adaptation, coworking flush every 10 steps
- [x] Eraser: circle with `destination-out`, size 3–400, round cursor sized to tool, erases existing layer pixels in both local and coworking strokes
- [x] Bucket: flood fill off the stroke thread (Web Worker), no size slider, sends `(x, y, color)` to coworker
- [x] Phone max size divided by 3; line adaptation on temporary stroke canvas for tools `< 75px` (commits after 15 px, 10 ms, or 5 steps)

## Gesture priority

- [x] 120 Hz Pointer Events (`pointerdown`, `pointermove` with `getCoalescedEvents()`, `pointerup`, `pointercancel`) with iPad canvas locks (`touch-action: none`, no selection/callout/overscroll)
- [x] Finger count state machine: 40 ms wait for second finger (commits immediately after 6 move events and replays buffered samples), second finger after single-finger start cancels stroke, 2-finger move is pinch/rotate/pan, 3+ fingers interrupts pinch, low-movement lift triggers 2-finger undo, 3-finger redo, 4-finger fullscreen
- [x] Single-contact priority: active resize handle -> resize mode content drag (with 2.5° rotation step, 45° guide line, X/Y layer magnetism guides) -> Apple Pencil draws (marks device as having stylus) -> finger pans when zoomed/rotated after Pencil seen -> pipette loupe -> draw on active owned layer (snapping to ruler if near)
- [x] Zoom & position math: `scale3d`, `rotate3d`, `translate3d` around gesture midpoint, scale clamped 0.3–5, snap-back over 250 ms when within 0.1 scale, 5° rotation, and 150 px center shift; desktop wheel + `ctrlKey` pinch / pan

## Ruler, Layers, Pipette, Save, Shared Drawing, Info, GPS Dashboard

- [x] Ruler: show/hide, 2-finger drag & rotate, degree readout, 90° perpendicular, specular mirror, stroke snap & lock, `--one-cm-size-by-scale`
- [x] Layers & per-user History: all 10 history step types (`CONTENT`, `OPACITY`, `SHOW`, `HIDE`, `ORDER`, `DUPLICATE`, `NEW`, `DELETE`, `MERGE`, `RENAME`), Undo button state fixed after resize reset
- [x] Pipette loupe: magnified rotated canvas patch, pixel color readout, confirms color into palette on lift and restores previous tool
- [x] Save & IndexedDB: new IndexedDB (`drawing_me_ts_DB`), 30s / 50-step draft autosave, two-phase save on exit with continuous spinner (no flicker), save copy, palette & tool persistence, GPS anchor persistence
- [x] Shared drawing (Coworking via PeerJS): all `editorEvents` messages (`CLIENT_ENVIRONMENT`, `EDITOR_COWORKING_STEPS`, `EDITOR_NEW_LAYER`, `EDITOR_SELECTED_LAYER`, `EDITOR_UNDO`, `EDITOR_REDO`, `EDITOR_DELETE_LAYER`, `EDITOR_RENAME_LAYER`, `EDITOR_DUPLICATE_LAYER`, `EDITOR_MERGE_LAYERS`, `EDITOR_OPACITY_LAYER`, `EDITOR_ENABLE_LAYER`, `EDITOR_DISABLE_LAYER`, `EDITOR_ORDER_DRAG_LAYER`, `EDITOR_FLIP_LAYER`, `EDITOR_RESIZE_LAYER`, `EDITOR_CLEAR_LAYER`, `EDITOR_TRANSFER_LAYER`), reject duplicate connection when session is already open, screen-size mismatch notice
- [x] Info page: About Us tab with logo, illustration, version, and credits
- [x] GPS Dashboard: high-accuracy geolocation, WGS84 Mercator `1 px = 1 mm` (`1000x1000 px = 1 m²`), camera pan/pinch-zoom with zoom percentage, pin current drawing at current GPS coordinate in IndexedDB, render nearby pinned drawings at true relative scale
