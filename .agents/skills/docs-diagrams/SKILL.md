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

The reference is the set of diagrams already published in the docs. They share one visual language: a faint grid background, white panels with a 1px border and a soft shadow, gray skeleton UI, gray arrows, and a small accent palette where each color carries a meaning. This skill reproduces that language from code so a new diagram sits next to the existing ones without looking like a different hand drew it.

## Files

| Task                                                          | Read                                       |
| ------------------------------------------------------------- | ------------------------------------------ |
| Colors, sizes, fonts, what each color means, shape anatomy    | [style-tokens.md](style-tokens.md)         |
| Reviewing a render before handing it off                      | [review-checklist.md](review-checklist.md) |
| Primitives: canvas, panels, tree rows, windows, holes, badges | [scripts/lib.mjs](scripts/lib.mjs)         |
| Generate SVG + HTML for every diagram module                  | [scripts/gen.mjs](scripts/gen.mjs)         |
| Screenshot light + dark PNGs at 2x                            | [scripts/render.sh](scripts/render.sh)     |

## Workflow

1. **Read the mdx first.** The `<Image>` block gives you the file names (`srcLight="/docs/light/<name>.png"`), the `width`/`height` the page reserves, and the `alt` text, which is the brief. The surrounding paragraph usually states the color legend in words ("gray marks output that must remain static, while blue marks work that can render later"). The drawing has to match that sentence exactly.

2. **Pull references from the docs.** The images are not in this repo; they are served from the docs blob store. List what exists and fetch the ones that explain something similar, in both themes, before drawing:

   ```bash
   grep -rhoE 'srcLight="[^"]+"' docs | sort -u
   curl -sL -o ref.png "https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com/docs/light/nested-layouts.png"
   ```

   Use the full `srcLight` path: most images live under `/docs/`, some under `/learn/`. Swap `light` for `dark` for the dark variant. If the page you are drawing for already has images, those are the first references. Look at two or three, not one: the anatomy is consistent and you want the shared parts, not one image's quirks. Published files are a mix of 1x and 2x; that is history, not a target. Always produce 2x.

3. **Write a diagram module.** Copy `scripts/` into a scratch folder outside the repo and add `diagrams/<name>.mjs`:

   ```js
   export default {
     name: 'my-diagram', // must equal the mdx srcLight basename
     width: 1600, // what the mdx declares
     height: 700,
     draw(t, lib) {
       const s = []
       // compose lib primitives here, laid out from a few named constants
       return s.join('\n')
     },
   }
   ```

   `lib.mjs` has the shapes the docs are built from: `panel`, `treePanel`, `urlPill`, `urlStack`, `arrow`, `bracketArrow`, `bracketCaption`, `browserWindow`, `skel.*`, `hole`, `card`, `grid`, `badge`, `statusBadge`, `legendRow`, `swatchLegend`, `callout`, `codePanel`, plus `label`/`code` for text, `textWidth` for sizing a block around a label, and the `icons`. Lay the block out from named constants and center it on the canvas. When a diagram needs a shape `lib` does not have, add it to `lib.mjs` using the existing tokens, in the same style, so the next diagram gets it too. Never hard-code a color or a one-off offset inside a shape.

   When the brief describes moments or stages (before/after, Shell → Prefetch → Navigation), the docs show them as a row of browser windows with arrows between them, each window showing the page at that moment, and, when values or APIs need comparing across the moments, bar rows underneath split at the gaps between windows. `grid` gives the columns-and-spans layout for the bars on its own when the windows add nothing.

4. **Render.** `./render.sh` runs `node gen.mjs` and screenshots each `<name>-<theme>.html` with headless Chrome at `--force-device-scale-factor=2`. Output lands in `light/<name>.png` and `dark/<name>.png`, the names the mdx expects. `node gen.mjs <name>` regenerates one diagram while iterating.

5. **Review both PNGs at full size** against [review-checklist.md](review-checklist.md) and against the references from step 2. Fix in constants and re-render. Do not hand off a PNG you have not looked at.

6. **Hand off** the PNGs with their pixel dimensions and the mdx path each one matches. Uploading to the blob store is a manual step by the docs maintainer, so the PNGs are the deliverable, not a commit. Check that the mdx `srcLight` basename and the PNG name agree, including singular vs plural. If you added a primitive to `lib.mjs`, commit it back into this skill, or hand off the diff if you cannot commit.

## What the docs typically draw

The published diagrams are combinations of a few shapes. These are the common kinds, with one page where you can see each; there are more, and new concepts may need a new combination.

- **File tree → URL**: a file-tree panel (folder, file, layout and route icons; the row the page is about is bold with a blue dot; elided children are a gray `...` row) with gray arrows to URL pills (globe + path, gray-filled when the path is not routable), bracket arrows beside the tree for which layout wraps which routes, and mono status badges (`Routable`, `Not Routable`). See [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) and [Project structure](https://nextjs.org/docs/app/getting-started/project-structure).
- **Files → component hierarchy**: a file list with an arrow to a code panel (React logo and a title in the bar, nested JSX in the docs' syntax colors). See [Project structure](https://nextjs.org/docs/app/getting-started/project-structure).
- **Browser window with skeleton UI**: traffic lights and a URL pill, the page as gray skeleton shapes (avatar, bars, sidebar squares, image placeholders). Content that has not rendered yet is a dashed hole; content that has arrived or is the subject is a solid accent card, sometimes floated outside the window with a blue arrow. A row of windows with arrows between them shows a sequence; bracket captions underneath name the groups. See [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) and [Caching](https://nextjs.org/docs/app/getting-started/caching).
- **Region map with badges**: a window whose regions are outlined and tinted by category, each tagged with a letter badge, with callouts on leader lines and a legend. The same badges tag rows in a tree and lines in a code panel so the views cross-reference. See [Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes).
- **Zone graph**: dashed, color-coded boxes with a tag in the corner, mono route pills inside, gray arrows between them labelled with mono pills (`SOFT NAV`, `HARD NAV`). See [Multi-zones](https://nextjs.org/docs/app/guides/multi-zones).

Some docs images are product screenshots (DevTools panels, the bundle analyzer, OS dialogs). Capture those from the real UI; this skill does not draw them.

## Conventions

- The docs canvas is 1600 CSS px wide and the page scales it to the column, so sizes in the tokens are sizes at 1600. For a new diagram, declare 1600 and let the height follow the content. If a page already declares a narrower width, match it, and scale element sizes by `width / 1600` so the picture reads the same size as its neighbours once the page scales it; a 1200 canvas drawn with 1600 sizes renders a third larger than everything around it.
- The mdx `height` wins over the "margins equal 60" rule: fit the content to the declared box with equal top and bottom margins, and change the mdx only if the content genuinely needs a different box.
- Within one picture a color means exactly one thing, and the same thing in every part of the picture (the windows, the bars, the legend). If the legend says blue is "renders later", nothing else may be blue. See "What the colors mean" in [style-tokens.md](style-tokens.md).
- Alignment is the review bar: equal margins, shared edges, text centered in its box, arrows and splits lined up vertically through the whole diagram. Measure margins from the ink, not from the coordinates you passed: text drawn with `dominant-baseline="central"` has its visual top about `0.35 × size` above its `y`.
- Draw what the brief names, nothing more: the alt text and the surrounding paragraph decide which values, rows and labels appear. The `alt` text's names win for labels in the picture; use `docs/01-app/04-glossary.mdx` for terminology the brief leaves open.
- Code and routes in Geist Mono, everything else in Inter. Geist Mono must be installed locally; the fallback is `ui-monospace`.

## Related skills

- `$write-guide` and `$write-api-reference` produce the mdx that references these images.
- `$update-docs` for finding which docs pages a code change touches.
