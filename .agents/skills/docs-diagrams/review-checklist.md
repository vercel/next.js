# Review checklist

Open both PNGs at full size next to the reference images, then complete this checklist before handing anything off. Each item comes from a problem found in a real draft.

## Against the references

- [ ] Same kind, same anatomy: a reader could not tell this image was drawn by someone else.
- [ ] Colors mean what they mean in the neighbouring diagrams (see "What the colors mean" in [style-tokens.md](style-tokens.md)). No accent used only to fill the palette.
- [ ] Within this picture every accent means one thing, in every part of the picture (windows, bars, legend).

## Edges and padding

- [ ] Nothing inside a panel touches its border. Holes, cards and rows sit inside the padding.
- [ ] Sibling elements share top and bottom edges (sidebar squares vs content box, tree rows vs their URL pills).
- [ ] Skeleton UI reads as a page: avatars are round and sit in their row, bars have breathing room, the post is a card and the comments are rows, the sidebar is clearly separate from the content. If a window's page was laid out by hand instead of `pageLayout`, check these especially.
- [ ] Every card or hole spans the full width of its content box.
- [ ] Bars and brackets start and end on the edges of the things they describe, to the pixel.

## Composition

- [ ] Left equals right and top equals bottom, within 4px. Measure from the ink with `python3 scripts/measure.py light/<name>.png` rather than trusting the coordinates you passed. The script ignores the grid; panel shadows still count, so the bottom reads a few px smaller than it is.
- [ ] On a canvas narrower than 1600, element sizes were scaled by `width / 1600`, so the picture will not render larger than its neighbours.
- [ ] The whole block is centered as one unit, not each column separately.
- [ ] Arrow heads, bar splits and leader lines line up with what they point at.
- [ ] Captions are centered under their windows or brackets.

## Text

- [ ] Labels are vertically centered (`dominant-baseline="central"`, not a hand-tuned `y`).
- [ ] Inter actually loaded: compare the "a" and "g" with a reference image. If Chrome screenshotted a fallback font, raise `--virtual-time-budget`.
- [ ] Code, routes and mono pills are in Geist Mono.
- [ ] Labels use the docs' terms (App Shell, Suspense fallback, per-link prefetch, Route Group). Check the glossary when unsure.
- [ ] Nothing is clipped at the canvas edge.

## Meaning

- [ ] The colors match the legend sentence in the mdx paragraph before the `<Image>`.
- [ ] Only what the brief names is in the picture: no extra rows, values or labels pulled in from elsewhere.
- [ ] Each frame of a sequence shows the right amount of content for its moment.
- [ ] The alt text in the mdx still describes this picture.
- [ ] Width and height in the mdx match the SVG (the PNG is exactly 2× each).

## Both themes

- [ ] Dark background is `#0D0D0D`, not pure black. Grid lines are visible but faint.
- [ ] Accent fills in dark mode are the navy / plum / wine tokens, not the light-mode pastels.
- [ ] Shadows are stronger in dark mode and barely visible in light mode.

## Files

- [ ] Output names equal the mdx `srcLight` / `srcDark` basenames, including singular vs plural.
- [ ] You handed off `light/<name>.png` and `dark/<name>.png` with their pixel dimensions and the mdx each belongs to.
- [ ] Any primitive you added to `lib.mjs` is committed back into this skill so the next diagram gets it.
