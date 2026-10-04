# Style tokens

Every value here was taken from the real docs diagrams or from approved renders. Use the token, not a new hex.

## Canvas

| Property   | Value                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Width      | 1200 (CSS px; render at 2x → 2400)                                                                        |
| Height     | per diagram, declared in the mdx (`530` for three bar rows, `480` for two)                                |
| Background | `light #FAFAFA`, `dark #111111`                                                                           |
| Grid       | 40px squares, 1px lines, `light #EDEDED`, `dark #1F1F1F`, drawn as an SVG `<pattern>` over the background |
| Margins    | equal on all four sides, 44 to 48px. Center the content block, never left-align it                        |

## Colors

| Token                                       | Light                                         | Dark                              | Used for                                        |
| ------------------------------------------- | --------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `winFill`                                   | `#FFFFFF`                                     | `#1A1A1A`                         | browser window body                             |
| `winHead`                                   | `#F7F7F7`                                     | `#232323`                         | browser title bar                               |
| `winStroke`                                 | `#D9D9D9`                                     | `#3A3A3A`                         | window border, title bar divider, card outlines |
| `shadow`                                    | `rgba(0,0,0,0.07)`                            | `rgba(0,0,0,0.45)`                | window drop shadow (blurred rect, offset 6px)   |
| `skel`                                      | `#D1D1D1`                                     | `#4A4A4A`                         | skeleton bars, avatars, sidebar squares         |
| `url` / `urlStroke` / `urlText`             | `#FFFFFF` / `#D4D4D4` / `#8A8A8A`             | `#1A1A1A` / `#454545` / `#8F8F8F` | URL pill                                        |
| `blue`                                      | `#0070F3`                                     | `#0A72EF`                         | blue strokes (dashed holes, "renders" bars)     |
| `blueFill`                                  | `#DCEBFE`                                     | `#10233D`                         | blue region fill                                |
| `barGray` / `barGrayStroke` / `barGrayText` | `#EBEBEB` / `#BDBDBD` / `#666666`             | `#262626` / `#555555` / `#A1A1A1` | gray bars                                       |
| `barBlueText`                               | `#0060D1`                                     | `#52A8FF`                         | text inside blue bars                           |
| `label`                                     | `#6F6F6F`                                     | `#A1A1A1`                         | stage captions under windows                    |
| `code`                                      | `#4D4D4D`                                     | `#D4D4D4`                         | monospace row labels                            |
| `arrow`                                     | `#A8A8A8`                                     | `#5E5E5E`                         | arrows between windows                          |
| Traffic lights                              | `#FF5F57`, `#FEBC2E`, `#28C840` (both themes) |                                   | the three window dots                           |

## What the colors mean

The docs use color as a legend, so keep the meaning stable across diagrams:

- **Gray, solid fill**: static output, prerendered, served from the build. Also the neutral skeleton color for any UI that is not the point.
- **Blue, dashed stroke + blue fill**: a region that is not rendered yet at this stage and will render later (a Suspense hole, "can render later").
- **Blue, solid stroke + blue fill**: the stage where deferred work actually renders.
- **Gray, dashed stroke, no fill**: a Suspense fallback standing in for content.
- Purple appears in some official diagrams for cached / `use cache` content and amber for session data. Only reach for them when the diagram is about caching or cookies, and say so in the legend.

Never color a box to fill the palette. If a region's role is not the story, it stays gray.

## Typography

| Text                    | Font       | Size | Weight | Notes                                                  |
| ----------------------- | ---------- | ---- | ------ | ------------------------------------------------------ |
| Stage captions (Shell…) | Inter      | 16   | 500    | centered under each window, 30px below it              |
| Bar labels (Static…)    | Inter      | 12.5 | 500    | 14px left padding, `dominant-baseline="central"`       |
| URL pill                | Inter      | 9.5  | 400    | after a 6×4.5 lock glyph                               |
| Code row labels         | Geist Mono | 14   | 400    | right-aligned to the label column, centered on the bar |

Inter comes from Google Fonts in the HTML wrapper (`display=block` so Chrome waits for it). Geist Mono must be installed locally (for example `~/Library/Fonts/GeistMono-*.otf`); if it is missing, the fallback `ui-monospace` is acceptable but say so when you hand off.

## Browser window anatomy

Window 256 × 208, radius 10, 1px `winStroke`. Title bar 30px with the three dots at 13px spacing starting 14px in, and a URL pill (height 18, radius 5) filling the rest minus 14px padding. Below the bar, 14px padding everywhere:

- Navbar row: a 48×10 skeleton pill left, a 44×10 pill and a 9px-radius avatar right.
- Sidebar: four 22×22 squares (radius 4) spread evenly over the full content height.
- Main content box: from the sidebar's right edge + 14 to the window's right padding, from below the navbar + 14 to the bottom padding. Every post card, dashed hole, or comment row lives inside this box and shares its top and bottom edges with the sidebar.

Post card: 62 tall, 1px `winStroke` outline, radius 6, with a 84×10 title bar and two 6px body lines. Comment row: 5px-radius avatar plus a 6px line, rows spread evenly to the content bottom.

## Bars and arrows

Bars are 34 tall, radius 8, with 58px between row tops. Gray bars use a 1px stroke snapped to the half pixel; blue bars use a 1.5px stroke (`stroke-dasharray="5 4"` when dashed). A split between two bars is 8px wide and centered exactly on the arrow between the corresponding windows, so the stage boundary reads vertically through the whole diagram.

Arrows are 28px long, 1.5px, round caps, with a 7px open chevron head, vertically centered on the windows.

## Crispness

Snap every 1px stroke to a `.5` coordinate (`x + 0.5`, `width - 1`). Leave 1.5px strokes on integers. Render with `--force-device-scale-factor=2` and `--hide-scrollbars`.
