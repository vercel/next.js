---
name: docs-diagrams
description: >
  Draw diagrams for the Next.js docs in the style of the ones already
  published there: the light/dark PNGs an mdx references with
  `<Image srcLight="/docs/light/<name>.png" srcDark="/docs/dark/<name>.png">`.
  Use when a guide or API reference needs a new diagram or an existing one
  needs a change. Hand-written SVG from a primitives library, rendered by
  headless Chrome at 2x. No AI image generation.
disable-model-invocation: true
---

# Docs diagrams

Use the diagrams already published in the docs as references. They share a faint grid background, bordered panels with soft shadows, gray skeleton UI, gray arrows, and a small accent palette in which each color has a consistent meaning. This skill reproduces that visual language from code.

## Files

| Task                                                          | Read                                       |
| ------------------------------------------------------------- | ------------------------------------------ |
| Colors, sizes, fonts, what each color means, shape anatomy    | [style-tokens.md](style-tokens.md)         |
| Reviewing a render before handing it off                      | [review-checklist.md](review-checklist.md) |
| Primitives: canvas, panels, tree rows, windows, holes, badges | [scripts/lib.mjs](scripts/lib.mjs)         |
| Generate SVG + HTML for every diagram module                  | [scripts/gen.mjs](scripts/gen.mjs)         |
| Screenshot light + dark PNGs at 2x                            | [scripts/render.sh](scripts/render.sh)     |
| Measure a render's margins from the ink                       | [scripts/measure.py](scripts/measure.py)   |

## Workflow

### 1. Read the mdx

The `<Image>` block gives you the file names (`srcLight="/docs/light/<name>.png"`), the `width` and `height` the page reserves, and the `alt` text, which is the brief.

The paragraph before the image often states the color legend in words ("gray marks static output and blue marks content that can render at request time"). When it does, the drawing has to match that sentence exactly. When it does not, take the states the alt text names (a Suspense fallback, request-time content), map them with "What the colors mean" in [style-tokens.md](style-tokens.md), and suggest adding the legend sentence to the mdx in your hand-off.

Draw only what the brief names. The alt text and surrounding paragraph determine which values, rows, and labels appear. Use the labels from the alt text and `docs/01-app/04-glossary.mdx` for terminology the brief leaves open.

### 2. Pull references from the docs

The images are not in this repo; they are served from the docs blob store. List what exists and fetch two or three that explain something similar, in both themes, before drawing:

```bash
grep -rhoE 'srcLight="[^"]+"' docs | sort -u
curl -sL -o ref.png "https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com/docs/light/nested-layouts.png"
```

Use the full `srcLight` path: most images live under `/docs/`, some under `/learn/`. Swap `light` for `dark` for the dark variant. If the page you are drawing for already has images, those are the first references. Look at more than one: the anatomy is consistent, and you want the shared parts rather than one image's quirks. Published files are a mix of 1x and 2x; that is history, not a target. Always produce 2x.

### 3. Write a diagram module

Copy `scripts/` into a scratch folder outside the repo and add `diagrams/<name>.mjs`:

```js
export default {
  name: 'my-diagram', // must equal the mdx srcLight basename
  width: 1600, // what the mdx declares
  height: 700,
  draw(t, lib, { width, height }) {
    const k = width / 1600
    const s = []
    // compose lib primitives here, laid out from a few named constants
    return s.join('\n')
  },
}
```

`lib.mjs` has the shapes the docs are built from:

- Panels and rows: `panel`, `treePanel`, `urlPill`, `urlStack`, `codePanel`.
- Arrows and captions: `arrow`, `bracketArrow`, `bracketCaption`, `callout`.
- Browser windows: `browserWindow(t, x, y, w, h, url, body = '')` for the frame, `pageLayout` for the page inside it, `postCard` and `commentRows` for the content, `skel.*` for single placeholders. Pass the URL and body as positional arguments.
- States and comparisons: `hole` (not rendered yet), `card` (rendered or highlighted), `grid` (columns and spans for bars).
- Badges and legends: `badge`, `statusBadge`, `legendRow`, `swatchLegend`.
- Text: `label`, `code`, `textWidth` for sizing a block around a label, and the `icons`.

Build a window's page with `pageLayout` rather than placing skeleton atoms by hand. It carries the spacing that makes placeholders read as a page, and returns `regions.post` and `regions.comments` for the usual split of the content column.

When the brief describes moments or stages (before and after, Shell → Prefetch → Navigation), the docs show them as a row of browser windows with arrows between them, each window showing the page at that moment. Content that has rendered at one moment stays rendered, in the same style, in every later moment. When values or APIs need comparing across the moments, bar rows go underneath, split at the gaps between the windows. `grid` lays out those bars; its column headers sit under the windows and double as their captions (the comment on `grid` says how to line the two up). Use `grid` on its own when windows would add nothing.

Lay the block out from named constants and center it on the canvas. When a diagram needs a shape `lib` does not have, add it to `lib.mjs` using the existing tokens, in the same style, so the next diagram gets it too. Never hard-code a color or a one-off offset inside a shape.

A module may export an array of diagrams when several share a drawing. Helper modules without a default export are skipped.

### 4. Render

Run `./render.sh` from inside the scratch folder. It runs `node gen.mjs` and screenshots each `<name>-<theme>.html` with headless Chrome at `--force-device-scale-factor=2`. Output lands in `light/<name>.png` and `dark/<name>.png`, the names the mdx expects. `node gen.mjs <name>` regenerates one diagram while iterating.

The script defaults to the macOS Google Chrome path. On Linux, Windows, or a machine with Chrome installed elsewhere, set `CHROME` to the browser executable:

```bash filename="Terminal"
CHROME=/path/to/chrome ./render.sh
```

### 5. Review

Look at both PNGs at full size, against [review-checklist.md](review-checklist.md) and against the references from step 2. Run `python3 scripts/measure.py light/<name>.png` for the margins. Fix in constants and re-render. Do not hand off a PNG you have not looked at.

### 6. Hand off

Deliver the PNGs with their pixel dimensions and the mdx path each one matches. Uploading to the blob store is a manual step by the docs maintainer, so the PNGs are the deliverable, not a commit. Check that the mdx `srcLight` basename and the PNG name agree, including singular vs plural. If you added a primitive to `lib.mjs`, commit it back into this skill, or hand off the diff if you cannot commit.

## What the docs typically draw

The published diagrams are combinations of a few shapes. These are the common kinds, each with a page where you can see it. There are more, and a new concept may need a new combination.

- **File tree → URL**: a file-tree panel (folder, file, layout and route icons; the row the page is about is bold with a blue dot; elided children are a gray `...` row) with gray arrows to URL pills (globe + path, gray-filled when the path is not routable), bracket arrows beside the tree for which layout wraps which routes, and mono status badges (`Routable`, `Not Routable`). See [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) and [Project structure](https://nextjs.org/docs/app/getting-started/project-structure).
- **Files → component hierarchy**: a file list with an arrow to a code panel (React logo and a title in the bar, nested JSX in the docs' syntax colors). See [Project structure](https://nextjs.org/docs/app/getting-started/project-structure).
- **Browser window with skeleton UI**: traffic lights and a URL pill, the page as gray skeleton shapes (avatar, bars, sidebar, image placeholders). Content that has not rendered yet is a dashed hole; content that has arrived or is the subject is a solid accent card, sometimes floated outside the window with a blue arrow. A row of windows with arrows between them shows a sequence; bracket captions underneath name the groups. See [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) and [Caching](https://nextjs.org/docs/app/getting-started/caching).
- **Region map with badges**: a window whose regions are outlined and tinted by category, each tagged with a letter badge, with callouts on leader lines and a legend. The same badges tag rows in a tree and lines in a code panel so the views cross-reference. See [Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes).
- **Zone graph**: dashed, color-coded boxes with a tag in the corner, mono route pills inside, gray arrows between them labelled with mono pills (`SOFT NAV`, `HARD NAV`). See [Multi-zones](https://nextjs.org/docs/app/guides/multi-zones).

Some docs images are product screenshots (DevTools panels, the bundle analyzer, OS dialogs). Capture those from the real UI; this skill does not draw them.

## Conventions

**Canvas.** The docs canvas is 1600 CSS px wide and the page scales it to the column, so the sizes in the tokens are sizes at 1600. For a new diagram, declare 1600 and let the height follow the content. If a page already declares a narrower width, match it and scale element sizes by `k = width / 1600`, otherwise the picture renders larger than its neighbours once the page scales it. `grid`, `swatchLegend`, `arrow`, `pageLayout`, `postCard` and `commentRows` take or derive `k` and scale their defaults by it; pass `× k` sizes to `skel.*`, `hole` and `card` yourself.

**Margins.** The mdx `height` wins: fit the content to the declared box. Top must equal bottom and left must equal right, within 4px; the two pairs need not match each other. Measure from the ink with `scripts/measure.py`, not from the coordinates you passed: text drawn with `dominant-baseline="central"` has its visual top about `0.35 × size` above its `y`, and `textWidth` is a heuristic, so expect to nudge by a few px after measuring.

**Color.** Within one picture a color means exactly one thing in the bars and the legend; if the legend says blue is "request-time content", nothing else may be blue. In the windows, rendered UI is always gray skeleton, whatever the bars say gray means; that is the docs' convention. Blue in a window marks the one state the picture is about (not included in static output, or newly rendered), the same state blue marks in the bars. See "What the colors mean" in [style-tokens.md](style-tokens.md).

**Alignment.** Equal margins, shared edges, text centered in its box, arrows and splits lined up vertically through the whole diagram. This is the review bar.

**Type.** Code and routes in Geist Mono, everything else in Inter. Geist Mono must be installed locally; the fallback is `ui-monospace`.

## Related skills

- `$write-guide` and `$write-api-reference` produce the mdx that references these images.
- `$update-docs` for finding which docs pages a code change touches.
