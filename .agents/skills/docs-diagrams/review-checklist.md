# Review checklist

Open both PNGs at full size and go through this before sending anything. Each item below is a problem a real draft had.

## Edges and padding

- [ ] Nothing inside a window touches the window border. Dashed holes, cards, and comment rows sit inside the 14px padding.
- [ ] The sidebar squares and the main content box share the same top edge and the same bottom edge.
- [ ] Every card or hole in the content box spans its full width.
- [ ] Bars start at the left edge of the first window and end at the right edge of the last window, to the pixel.

## Composition

- [ ] Left and right margins are equal. Measure from the leftmost label glyph to the canvas edge and from the rightmost bar to the canvas edge.
- [ ] Top and bottom margins are equal (within 4px).
- [ ] The label column, windows, and bars are centered as one block, not centered separately.
- [ ] Bar splits sit exactly under the arrow centers.
- [ ] Captions are centered under their windows.

## Text

- [ ] Bar labels and row labels are vertically centered in their bars (use `dominant-baseline="central"`, not a hand-tuned `y`).
- [ ] Inter actually loaded (compare the "a" and "g" shapes with a real docs diagram). If Chrome screenshotted a fallback font, raise `--virtual-time-budget`.
- [ ] Code labels are in Geist Mono and read as code (`ensureStatic = 'shell'`, `await prefetch()`).
- [ ] Labels use the docs' terms (App Shell, per-link prefetch, navigation, Suspense fallback).

## Meaning

- [ ] The colors match the legend sentence in the mdx paragraph before the `<Image>`.
- [ ] The windows show the right amount of content for each stage. Shell: layout plus one big hole. Prefetch: post filled, comments still a hole. Navigation: everything filled.
- [ ] The alt text in the mdx still describes this picture.
- [ ] Width and height in the mdx match the SVG viewBox (PNG is exactly 2× each).

## Both themes

- [ ] Dark background is `#111111`, not pure black. Grid lines are visible but faint.
- [ ] Blue fill in dark mode is the navy `#10233D`, not the light-mode `#DCEBFE`.
- [ ] Shadows are stronger in dark mode and barely visible in light mode.

## Files

- [ ] Output names equal the mdx `srcLight`/`srcDark` basenames, including singular vs plural.
- [ ] You handed off `light/<name>.png` and `dark/<name>.png` with their pixel dimensions and which mdx each belongs to.
