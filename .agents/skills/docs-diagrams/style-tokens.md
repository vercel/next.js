# Style tokens

Measured from published docs diagrams of every kind listed in SKILL.md. All values are CSS px on a 1600-wide canvas; `lib.mjs` holds the same values in its `themes` object. Use the token, not a new hex.

## Canvas

| Property   | Value                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Width      | 1600 (render at 2x → 3200). Match the width the mdx declares if a page uses another.                                                   |
| Height     | per diagram, declared in the mdx                                                                                                       |
| Background | light `#FBFBFB`, dark `#0D0D0D`                                                                                                        |
| Grid       | 40px squares, 1px lines, light `#F7F7F7`, dark `#161616`, an SVG `<pattern>` over the bg                                               |
| Margins    | about 60 when the height is yours to choose; equal top/bottom and equal left/right always. Center the whole block, never left-align it |

## Colors

| Token                               | Light                                                                                            | Dark                                | Used for                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------- |
| `panelTop` → `panelBottom`          | `#FFFFFF` → `#F9F9F9`                                                                            | `#313131` → `#282828`               | vertical gradient on every panel and window         |
| `panelStroke`                       | `#D9D9D9`                                                                                        | `#484848`                           | 1px panel, pill and card borders                    |
| `panelMuted`                        | `#F1F1F1`                                                                                        | `#1F1F1F`                           | gray-filled rows and pills (elided, not routable)   |
| `divider`                           | `#E8E8E8`                                                                                        | `#434343`                           | 1px lines between rows                              |
| `shadow`                            | `rgba(0,0,0,0.08)`                                                                               | `rgba(0,0,0,0.5)`                   | blurred rect under panels, offset 6px               |
| `titleBar` / `titleBarDivider`      | `#F7F7F7` / `#E3E3E3`                                                                            | `#232323` / `#3A3A3A`               | browser and code panel title bars                   |
| `text`                              | `#2E2E2E`                                                                                        | `#D4D4D4`                           | labels in trees and pills                           |
| `textSubtle`                        | `#616161`                                                                                        | `#8F8F8F`                           | URL in the window bar, code panel title, callouts   |
| `textMuted`                         | `#8F8F8F`                                                                                        | `#A1A1A1`                           | captions, legend text, muted rows                   |
| `icon` / `iconMuted`                | `#9A9A9A` / `#CECECE`                                                                            | `#888888` / `#555555`               | folder, file, globe, lock glyphs                    |
| `arrow`                             | `#A8A8A8`                                                                                        | `#878787`                           | arrows, brackets, bracket captions                  |
| `skel`                              | `#C9C9C9`                                                                                        | `#4A4A4A`                           | skeleton bars, avatars, squares, image placeholders |
| `blue.stroke` / `.fill` / `.text`   | `#0070F3` / `#D5E6FA` / `#0067D6`                                                                | `#0A72EF` / `#10233D` / `#52A8FF`   | the primary accent                                  |
| `blue.dot`                          | `#197DF3`                                                                                        | `#0761C9`                           | the "this file" marker in trees                     |
| `blue.skelOn` / `.thumbOn`          | `#A8B9CD` / `#C1D2E5`                                                                            | `#2F4A6E` / `#1E3657`               | skeleton inside a blue region                       |
| `purple.stroke` / `.fill` / `.text` | `#8E4EC6` / `#EAE0F2` / `#793AAF`                                                                | `#9A5CD0` / `#2A1F38` / `#C4A1E6`   | second accent (static regions, zone C, slot B)      |
| `red.stroke` / `.fill` / `.text`    | `#E5484D` / `#F7DFE0` / `#CA2A30`                                                                | same stroke / `#3A1D1F` / `#F08A8E` | negative badges, zone B                             |
| `green.stroke` / `.fill` / `.text`  | `#46A758` / `#DCEBDF` / `#46A758`                                                                | same stroke / `#1B2E1F` / `#6FCB80` | positive badges                                     |
| `gray.stroke` / `.fill` / `.text`   | `#8F8F8F` / `#DEDEDE` / `#666666`                                                                | `#6F6F6F` / `#2A2A2A` / `#B0B0B0`   | neutral mono pills (`SOFT NAV`)                     |
| `static.stroke` / `.fill` / `.text` | `#C9C9C9` / `#F1F1F1` / `#666666`                                                                | `#4A4A4A` / `#1F1F1F` / `#B0B0B0`   | a static / prerendered region in a bar or grid cell |
| `code.*`                            | GitHub Light: tag `#005CC5`, attr `#6F42C1`, keyword `#D73A49`, ident `#E36209`, punct `#909295` | GitHub Dark equivalents             | code panels                                         |
| `code.react`                        | `#61DAFB`                                                                                        | same                                | React logo in code panel titles                     |
| `trafficLights`                     | `#FF6059` `#FFBD2E` `#28CA42`                                                                    | same                                | the three window dots                               |

## What the colors mean

The docs use color as a legend, so keep the meaning stable across a diagram and consistent with its neighbours:

- **Gray**: static, prerendered, already there, or not the focus. Skeleton UI is always gray unless it sits inside an accent region. A static _region_ in a bar or grid cell is a stroked `static` card (`panelMuted` fill, `skel` stroke), so it has the same weight as the accent cards beside it; the darker `gray` accent is for mono pills.
- **Blue, dashed stroke + fill**: not included in static output at this stage; can render at request time (a Suspense hole, "request-time content").
- **Blue, solid stroke + fill**: content that has rendered, arrived, or is highlighted as the subject (streamed card, selected `<Link>`, slot A).
- **Gray, dashed stroke, no fill**: a Suspense fallback standing in for content.
- **Purple**: a second category next to blue (static vs dynamic regions, slot B, zone C), never a second shade of request-time content.
- **Red / green**: judgments (not routable / routable). Only in badges and zone boxes.

Within one picture every accent means exactly one thing, and the same thing in every part of the picture. Rendered UI inside a window stays gray skeleton regardless; only the state the picture is about gets the accent.

## Typography

| Text                      | Font       | Size | Weight | Notes                                                      |
| ------------------------- | ---------- | ---- | ------ | ---------------------------------------------------------- |
| Tree rows, URL pills      | Inter      | 20   | 400    | 600 for the highlighted row; `dominant-baseline="central"` |
| Captions, legend text     | Inter      | 20   | 400    | `textMuted`                                                |
| Callout labels            | Inter      | 22   | 600    | `textSubtle`, leader line in the region's accent           |
| Window URL                | Inter      | 20   | 400    | `textSubtle`, after a lock glyph; scales with the window   |
| Stage / column captions   | Inter      | 16   | 500    | `textMuted`, centered under the thing they name            |
| Code panel body           | Geist Mono | 20   | 400    | 36px line height                                           |
| Mono pills, status badges | Geist Mono | 18   | 400    | centered                                                   |
| Letter badges             | Inter      | 19   | 500    | in a 32px rounded square                                   |

Inter comes from Google Fonts in the HTML wrapper (`display=block` so Chrome waits for it). Geist Mono must be installed locally (`~/Library/Fonts/GeistMono-*.otf`); if it is missing the fallback `ui-monospace` is acceptable but say so when you hand off.

## Anatomy

**Panel**: radius 10, 1px `panelStroke` snapped to the half pixel, `panelTop→panelBottom` gradient, shadow rect offset 6px blurred 8px.

**Tree row**: 80 tall, 32px side padding, 18px icon, text 32px after the icon, 40px indent per depth, 1px `divider` between rows. Blue dot: 10px radius with a 16px radius `blue.fill` glow, 42px from the right edge. Muted row: `panelMuted` fill, muted icon and text.

**URL pill**: a one-row panel, globe at 32px, path at 64px. Stack several in one panel with dividers when they belong to one tree.

**Arrow**: 2px, round caps, open chevron head 10px long and 14px tall. Gray by default; blue when it carries streamed content. Bracket arrows beside a tree have a 10px corner radius and the same head.

**Browser window**: reference size 527×476. Title bar 70 tall, traffic lights radius 9 at 37/65/93px, URL pill 320×44 radius 8 starting at 155px. All of it scales with the width you pass (`k = w / 527`).

**Skeleton**: bars 24 tall radius 6, avatar radius 28, image placeholder is a tile with a sun and a mountain in `textMuted` at 60% opacity. Placeholders stand for real UI, so they keep real proportions: an avatar is a circle no taller than the row it sits in, bars have at least their own height of space between them, nothing touches a neighbour or the window edge.

**Page inside a window** (`pageLayout`): 28px padding at `k = 1`. Header row: avatar radius 14 and a 16px title bar centered on it, 16px apart. 24px below, a 110px-wide sidebar of four 14px bars (widths 1 / 0.75 / 0.9 / 0.6) spread evenly from the content's top edge to its bottom edge, then 24px, then the content column to the right padding. Content is a `postCard` (outlined card, 16px padding, 14px title bar, 8px body lines 18px apart) and `commentRows` (7px avatars with one 8px line each), or a `hole` / `card` spanning the same rect when that content is not there yet. Everything scales with the window's `k`.

**Hole**: 2px dashed stroke `8 5`, radius 10, fill from the accent. Optional centered label at `min(18, h/3)`. Scale `strokeWidth`, `dash` and `labelSize` down inside small windows.

**Badges**: letter badge 32px square, radius 8, 2px accent stroke, `badgeFill`. Status pill 34 tall, radius 6, 1.5px stroke, mono text.

**Grid**: column headers 20px/600 `textSubtle` with optional 15px subtitles (header 70 tall with subtitles, 48 without), a right-aligned mono label column, dashed `divider` lines between columns, rows 56 tall with 20px gaps, cells inset 10px from the dividers. All defaults scale with `k`. Cells are `card` / `hole` spans; a `swatchLegend` explains fill styles when the cells carry no text. Under a row of windows, the grid starts 16px below them.

**Text metrics**: there are no font metrics at generation time. `textWidth(str, size, { mono })` is the heuristic (0.52 × size per character for Inter, 0.58 for Geist Mono); size blocks with it rather than a new constant, then measure.

**Code panel**: 54px title bar with the React logo and a file name, 28px padding, 36px lines.

## Crispness

Snap every 1px stroke to a `.5` coordinate (`x + 0.5`, `width - 1`). Leave 1.5px and 2px strokes on integers. Render with `--force-device-scale-factor=2` and `--hide-scrollbars`.
