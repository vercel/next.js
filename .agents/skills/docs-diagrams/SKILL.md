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

The reference is the set of diagrams already in the docs. They share one visual language: a faint grid background, white panels with a 1px border and a soft shadow, gray skeleton UI, gray arrows, and a small accent palette where each color carries a meaning. This skill reproduces that language from code so a new diagram sits next to the existing ones without looking like a different hand drew it.

## Files

| Task                                                           | Read                                       |
| -------------------------------------------------------------- | ------------------------------------------ |
| Which kind of diagram the docs use for which concept           | [families.md](families.md)                 |
| Colors, sizes, fonts, what each color means                    | [style-tokens.md](style-tokens.md)         |
| Reviewing a render before handing it off                       | [review-checklist.md](review-checklist.md) |
| Primitives: canvas, panels, tree rows, windows, holes, badges  | [scripts/lib.mjs](scripts/lib.mjs)         |
| One module per diagram, each a few dozen lines on top of `lib` | [scripts/diagrams/](scripts/diagrams/)     |
| Generate SVG + HTML for every module                           | [scripts/gen.mjs](scripts/gen.mjs)         |
| Screenshot light + dark PNGs at 2x                             | [scripts/render.sh](scripts/render.sh)     |
| Finished SVGs, light and dark                                  | [examples/](examples/)                     |

## Workflow

1. **Read the mdx first.** The `<Image>` block gives you the file names (`srcLight="/docs/light/<name>.png"`), the `width`/`height` the page reserves, and the `alt` text, which is the brief. The surrounding paragraph usually states the color legend in words ("gray marks output that must remain static, while blue marks work that can render later"). The drawing has to match that sentence exactly.

2. **Find the family and pull its reference images.** Look up the concept in [families.md](families.md) to see which existing diagrams explain something similar, then fetch two or three of them from the blob store and look at them before drawing:

   ```bash
   curl -sL -o ref.png "https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com/docs/light/nested-layouts.png"
   ```

   Swap `light` for `dark` and the file name for any `srcLight` path in `docs/**/*.mdx`. The images are not in this repo. If a page you are drawing for already has images, those are the first references.

3. **Write a diagram module.** Copy `scripts/` into a scratch folder outside the repo and add `diagrams/<name>.mjs`. A module exports `{ name, width, height, draw(t, lib) }` and composes primitives from `lib.mjs`: `treePanel`, `urlPill`, `arrow`, `bracketArrow`, `browserWindow`, `skel.*`, `hole`, `card`, `badge`, `statusBadge`, `legendRow`, `callout`, `codePanel`, `bracketCaption`. Lay the block out from a few named constants and center it on the canvas. When a family needs a shape `lib` does not have, add it to `lib.mjs` using the existing tokens, in the same style, so the next diagram gets it too. Never hard-code a color or a one-off offset inside a shape.

4. **Render.** `./render.sh` runs `node gen.mjs` and screenshots each `<name>-<theme>.html` with headless Chrome at `--force-device-scale-factor=2`. Output lands in `light/<name>.png` and `dark/<name>.png`, the names the mdx expects. Pass a name to `node gen.mjs <name>` to regenerate one diagram while iterating.

5. **Review both PNGs at full size** against [review-checklist.md](review-checklist.md) and against the reference images from step 2. Fix in constants and re-render. Do not hand off a PNG you have not looked at.

6. **Hand off** the PNGs with their pixel dimensions and the mdx path each one matches. Uploading to the blob store is a manual step by the docs maintainer, so the PNGs are the deliverable, not a commit. Check that the mdx `srcLight` basename and the PNG name agree, including singular vs plural. Commit the new module and its SVGs under `examples/` back into this skill.

## Conventions

- The docs canvas is 1600 CSS px wide; the page scales it down. Declare that width in the mdx and let the height follow the content. Older pages declare other widths; match what the page declares.
- Within one picture, a color means exactly one thing, and it means the same thing in every part of the picture (the windows, the bars, the legend). If the legend says blue is "renders later", nothing else may be blue.
- Alignment is the review bar: equal margins, shared edges, text centered in its box, arrows and splits lined up vertically through the whole diagram.
- Labels use the docs' vocabulary. Check `docs/01-app/04-glossary.mdx` when unsure.
- Code and routes in Geist Mono, everything else in Inter. Geist Mono must be installed locally; the fallback is `ui-monospace`.

## Related skills

- `$write-guide` and `$write-api-reference` produce the mdx that references these images.
- `$update-docs` for finding which docs pages a code change touches.
