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

   Swap `light` for `dark` and the file name for any `srcLight` path. If the page you are drawing for already has images, those are the first references. Look at two or three, not one: the anatomy is consistent and you want the shared parts, not one image's quirks.

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

   `lib.mjs` has the shapes the docs are built from: `panel`, `treePanel`, `urlPill`, `arrow`, `bracketArrow`, `bracketCaption`, `browserWindow`, `skel.*`, `hole`, `card`, `badge`, `statusBadge`, `legendRow`, `callout`, `codePanel`, plus `label`/`code` for text and the `icons`. Lay the block out from named constants and center it on the canvas. When a diagram needs a shape `lib` does not have, add it to `lib.mjs` using the existing tokens, in the same style, so the next diagram gets it too. Never hard-code a color or a one-off offset inside a shape.

4. **Render.** `./render.sh` runs `node gen.mjs` and screenshots each `<name>-<theme>.html` with headless Chrome at `--force-device-scale-factor=2`. Output lands in `light/<name>.png` and `dark/<name>.png`, the names the mdx expects. `node gen.mjs <name>` regenerates one diagram while iterating.

5. **Review both PNGs at full size** against [review-checklist.md](review-checklist.md) and against the references from step 2. Fix in constants and re-render. Do not hand off a PNG you have not looked at.

6. **Hand off** the PNGs with their pixel dimensions and the mdx path each one matches. Uploading to the blob store is a manual step by the docs maintainer, so the PNGs are the deliverable, not a commit. Check that the mdx `srcLight` basename and the PNG name agree, including singular vs plural. If you added a primitive to `lib.mjs`, commit that back into this skill.

## What the docs typically draw

The published diagrams are combinations of a few shapes. These are the common kinds, with one page where you can see each; there are more, and new concepts may need a new combination.

- **File tree → URL**: a file-tree panel (folder, file, layout and route icons; the row the page is about is bold with a blue dot; elided children are a gray `...` row) with gray arrows to URL pills (globe + path, gray-filled when the path is not routable), bracket arrows beside the tree for which layout wraps which routes, and mono status badges (`Routable`, `Not Routable`). See [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) and [Project structure](https://nextjs.org/docs/app/getting-started/project-structure).
- **Files → component hierarchy**: a file list with an arrow to a code panel (React logo and a title in the bar, nested JSX in the docs' syntax colors). See [Project structure](https://nextjs.org/docs/app/getting-started/project-structure).
- **Browser window with skeleton UI**: traffic lights and a URL pill, the page as gray skeleton shapes (avatar, bars, sidebar squares, image placeholders). Content that has not rendered yet is a dashed hole; content that has arrived or is the subject is a solid accent card, sometimes floated outside the window with a blue arrow. A row of windows with arrows between them shows a sequence; bracket captions underneath name the groups. See [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) and [Caching](https://nextjs.org/docs/app/getting-started/caching).
- **Region map with badges**: a window whose regions are outlined and tinted by category, each tagged with a letter badge, with callouts on leader lines and a legend. The same badges tag rows in a tree and lines in a code panel so the views cross-reference. See [Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes).
- **Zone graph**: dashed, color-coded boxes with a tag in the corner, mono route pills inside, gray arrows between them labelled with mono pills (`SOFT NAV`, `HARD NAV`). See [Multi-zones](https://nextjs.org/docs/app/guides/multi-zones).

Some docs images are product screenshots (DevTools panels, the bundle analyzer, OS dialogs). Capture those from the real UI; this skill does not draw them.

## Conventions

- The docs canvas is 1600 CSS px wide; the page scales it down. Declare that width in the mdx and let the height follow the content. If a page already declares another width, match it.
- Within one picture a color means exactly one thing, and the same thing in every part of the picture (the windows, the bars, the legend). If the legend says blue is "renders later", nothing else may be blue. See "What the colors mean" in [style-tokens.md](style-tokens.md).
- Alignment is the review bar: equal margins, shared edges, text centered in its box, arrows and splits lined up vertically through the whole diagram.
- Labels use the docs' vocabulary. Check `docs/01-app/04-glossary.mdx` when unsure.
- Code and routes in Geist Mono, everything else in Inter. Geist Mono must be installed locally; the fallback is `ui-monospace`.

## Related skills

- `$write-guide` and `$write-api-reference` produce the mdx that references these images.
- `$update-docs` for finding which docs pages a code change touches.
