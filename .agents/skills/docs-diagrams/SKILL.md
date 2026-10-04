---
name: docs-diagrams
description: >
  Draw the light/dark PNG diagrams used in the Next.js docs, the kind an mdx
  references with `<Image srcLight="/docs/light/<name>.png" srcDark="/docs/dark/<name>.png">`.
  Use when a guide or API reference needs a diagram, when an mdx references an
  image that does not exist in the docs blob store yet, or when asked for a
  diagram "in the style of the Next.js docs". Hand-written SVG from
  `scripts/gen.mjs`, rendered by headless Chrome at 2x with `scripts/render.sh`.
  No AI image generation.
---

# Docs diagrams

The docs diagrams are flat, grid-backed illustrations: mock browser windows, gray skeleton bars, and blue regions for content that renders later. They are drawn as SVG from a small Node script and screenshotted with headless Chrome in light and dark, at 2x. The script owns every coordinate, so alignment problems are fixed once in a constant, not nudged per shape.

Do not route this through an AI image tool. Edits stay in code so the next diagram starts from the same tokens.

## Files

| Task                                                 | Read                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| Colors, sizes, fonts, what each color means          | [style-tokens.md](style-tokens.md)         |
| Reviewing a render before handing it off             | [review-checklist.md](review-checklist.md) |
| Generator (edit the `diagrams` map, keep the tokens) | [scripts/gen.mjs](scripts/gen.mjs)         |
| Render light + dark PNGs at 2x                       | [scripts/render.sh](scripts/render.sh)     |
| Finished examples as SVG, light and dark             | [examples/](examples/)                     |

## Workflow

1. **Read the mdx first.** The `<Image>` block gives you the file names (`srcLight="/docs/light/<name>.png"`), the `width`/`height` the page reserves, and the `alt` text, which is the diagram's brief. The paragraph before the image usually states the color legend in words ("gray marks output that must remain static, while blue marks work that can render later"). The drawing has to match that sentence exactly.

2. **Pull one real docs diagram to calibrate.** The images are not in this repo. They are served from the docs blob store, so fetch a sibling from the same section and look at it before drawing:

   ```bash
   curl -sL -o ref-light.png "https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com/docs/light/server-rendering-with-streaming.png"
   ```

   Swap `light` for `dark` and the file name for any `srcLight` path you find in `docs/**/*.mdx`. Good calibration references: `docs/light/server-rendering-with-streaming.png` (browser window, skeleton bars, blue dashed holes, bracket captions) and `learn/light/thinking-in-ppr.png` (region map with S/D badges and a legend).

3. **Define the diagram in `scripts/gen.mjs`.** Copy `scripts/gen.mjs` and `scripts/render.sh` into a scratch folder outside the repo. The `diagrams` map at the top holds one entry per image: its canvas height, its bar rows, and how the windows mark deferred content (`holeLabel`, `holeStyle`, `highlightRendered`). The shared constants below it (window size, padding, label widths, bar height) are the layout. Add a new row kind or a new drawing function when the picture needs one, and keep using the token names from [style-tokens.md](style-tokens.md). Never hard-code a color or an offset inside a shape.

4. **Render.** `./render.sh` runs `node gen.mjs` and screenshots each `<name>-<theme>.html` with headless Chrome at `--force-device-scale-factor=2`. Output lands in `light/<name>.png` and `dark/<name>.png`, which is the naming the mdx expects. The HTML wrapper loads Inter from Google Fonts with `display=block` and the render waits with `--virtual-time-budget=4000`, so text is never screenshotted in a fallback font.

5. **Review both PNGs at full size** against [review-checklist.md](review-checklist.md) before handing off. Dashed boxes touching the window edge and an off-center composition are the two most common misses. Fix in the constants and re-render. Do not hand off a PNG you have not looked at.

6. **Hand off** the PNGs (two per diagram, light and dark) with their pixel dimensions and the mdx path each one matches. Uploading to the blob store is a manual step by the docs maintainer, so the PNGs are the deliverable, not a commit. Check that the mdx file name and the PNG name agree, including singular vs plural (`ensure-static-stage` vs `ensure-static-stages` is an easy slip). Commit the updated `gen.mjs` and example SVGs back into this skill so the next diagram starts from them.

## Diagram families this script already draws

- **Navigation stages strip**: three browser windows labelled Shell → Prefetch → Navigation, each showing more of the page filled in, with an arrow between them. Below, one bar row per concept, split at the gap between windows. Two variants, see [examples/](examples/):
  - `ensure-static-stage` (used by `docs/01-app/02-guides/keeping-pages-static.mdx`): gray "Static" bars vs blue dashed "Can render later" bars; the windows mark not-yet-rendered content with a blue dashed box labelled "Renders later".
  - `navigation-stage` (used by `docs/01-app/02-guides/optimizing-prefetching.mdx`): gray dashed "Suspense fallback" bars vs blue solid "Renders" bars; the windows mark the fallback with a gray dashed box and color the content that has rendered so far blue (`holeStyle: 'gray'`, `highlightRendered: true`).

  Within one picture, blue means exactly one thing. Match the window styling to whichever bar carries the same meaning, so a reader can't mistake the highlighted hole for the stage itself.

For a different picture (a component tree, a request sequence, a region map with badges), keep the canvas, grid, window anatomy, type scale, and color semantics from the tokens file, and write a new drawing function in the same style as `win()` and `bar()`.

## Conventions

- Alignment is the review bar. Equal margins, shared edges, and text centered in its box matter more than ornament.
- Canvas width is 1200 CSS px because the docs render at that width. Height is whatever the content needs, declared in the mdx.
- Match the docs' vocabulary in labels (App Shell, per-link prefetch, navigation, Suspense fallback). Check `docs/01-app/04-glossary.mdx` when unsure.
- Code labels in Geist Mono, everything else in Inter. Those are the docs fonts.

## Related skills

- `$write-guide` and `$write-api-reference` produce the mdx that references these images.
- `$update-docs` for finding which docs pages a code change touches.
