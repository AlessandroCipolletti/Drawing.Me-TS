# Drawith.Me — 10 New Feature Suggestions

Based on the current codebase — touch-first 120 Hz stroke engine, layers with masks and adjustments, lasso/magic wand, custom brushes, ruler/symmetry guides, P2P coworking, GPS dashboard, and local-first IndexedDB storage — here are ten features that are missing today and would fit the project naturally.

## 1. Text Tool

Add a text tool to the tool rail for titles, captions, speech bubbles, and annotations.
Tapping the canvas places an editable text box with font, size, weight, alignment, and colour controls.
Text lives on its own layer type so it stays re-editable instead of being flattened into pixels.
Double-tapping the layer reopens editing, while the transform box moves, scales, and rotates it.
On export the text is rasterised into the flattened image, and coworkers see it update live.

## 3. Reference Image Import and Overlay

Let users import a photo from the device and place it on its own locked reference layer.
The image can be moved, scaled, rotated, and made semi-transparent for tracing over.
A floating, pinnable reference mode would keep the photo visible beside the canvas while drawing.
Imported images should downscale on a Worker so big photos never block the UI thread.
Reference layers are excluded from export by default but can be merged in when wanted.

## 4. Timelapse Recording and Video Export

Record stroke history in the background and replay it as a drawing timelapse.
Users could export the replay as MP4 or GIF directly from the Folder share menu.
Playback controls would offer speed, pause, and trimming of the start and end.
Because strokes are already deterministic samples, replay can reuse the existing painter.
Timelapses are highly shareable and would promote the app on social media organically.

## 5. Named Snapshots and Version History

Add snapshots so users can save named milestones of a drawing inside the Folder.
Tapping a snapshot restores that exact layer stack without losing the current version.
A simple timeline UI shows thumbnail, name, and date for each saved state.
Snapshots reuse the IndexedDB layer serialisation already used by autosave.
This gives artists a safety net for bold experiments that undo history cannot offer.

## 6. Flipbook Animation Mode

Turn layers into animation frames with a lightweight flipbook mode per drawing.
Onion skinning shows previous and next frames at low opacity while drawing.
A timeline scrubber, frame duplicate/delete, and adjustable FPS cover the basics.
Playback previews in place, and export supports animated GIF or sprite sheet.
It builds directly on the layer stack, so no new document format is needed.

## 7. Project File Export, Import, and Backup

Introduce a `.drawith` project file containing layers, masks, adjustments, and palette.
Users can export it from Folder, back it up anywhere, and re-import it on any device.
This also enables sharing a fully editable drawing, not just a flattened image.
Optionally, the same format could sync through the user's own cloud storage later.
It protects years of local-only work from being lost with a single browser reset.

## 8. Geometric Shape Tools

Add a shapes tool with rectangle, ellipse, line, arrow, polygon, and star primitives.
Dragging draws a live preview; holding keeps proportions locked to a perfect square or circle.
Shapes support stroke colour, fill colour, line width, and dashed outlines.
They rasterise onto the active layer, respecting symmetry and the ruler like freehand strokes.
This fills a common gap for diagrams, comics panels, borders, and UI sketches.

## 9. Liquify Brush

Add a liquify tool that pushes, pulls, pinches, and swirls existing pixels under the brush.
Brush size and strength sliders control how far pixels are displaced per stroke.
It should run on a tiled offscreen canvas or Worker to stay smooth on large layers.
Liquify respects masks and selections so only the intended area is distorted.
It is one of the most requested retouching tools in drawing apps and complements warp.

## 10. Perspective Guides

Extend the guides system with one, two, and three point perspective grids.
Users drag vanishing points on canvas and see converging guide lines update live.
Strokes optionally snap to the nearest perspective line, like they snap to the ruler.
Grid density, colour, and opacity are adjustable, and guides never appear in exports.
This makes backgrounds, buildings, and interiors far easier for illustrators and students.
