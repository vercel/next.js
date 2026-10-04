# Diagram families in the docs

Every published docs diagram falls into one of a handful of families. Pick the one the concept belongs to, fetch its references from the blob store (`/docs/light/<name>.png`), and build from the primitives listed. Names below are the `srcLight` basenames.

## File tree → URL

A file-tree panel on the left (folder, file, layout and route icons, 80px rows, 40px indent per level), gray arrows to URL pills on the right (globe + path). The row the page is about is bold with a blue dot. Elided children are a gray `...` row. Bracket arrows to the left of the tree show which layout wraps which routes. Status badges in mono (green `Routable`, red `Not Routable`) sit after the pills; a pill for an unroutable path is gray-filled.

References: `page-special-file`, `layout-special-file`, `route-special-file`, `template-special-file`, `nested-layouts`, `blog-nested-route`, `blog-post-nested-route`, `route-group-*`, `project-organization-*`, `parallel-routes-file-system`, `intercepted-routes-files`, `top-level-folders`, `public-folder`, `mdx-files`.

Primitives: `treePanel`, `urlPill`, `urlStack`, `arrow`, `bracketArrow`, `statusBadge`. Example: [scripts/diagrams/example-file-tree.mjs](scripts/diagrams/example-file-tree.mjs).

## File list → component hierarchy

A file list (same rows as the tree, no nesting) with an arrow to a code panel titled with the React logo and "Component Hierarchy", showing nested JSX in syntax colors. Explains which file renders where.

References: `file-conventions-component-hierarchy`, `nested-file-conventions-component-hierarchy`, `nested-error-component-hierarchy`, `error-overview`.

Primitives: `treePanel` (depth 0 rows), `arrow`, `codePanel`.

## Browser window with skeleton UI

A browser window (traffic lights, URL pill) whose page is drawn as gray skeleton shapes: avatar, bars, sidebar squares, image placeholders. Content that has not rendered yet is a blue dashed hole; content arriving is a blue solid card, often floated outside the window with a blue arrow pointing in. Bracket captions under the groups explain the two sides. Several windows in a row with gray arrows show a sequence (before → after, Shell → Prefetch → Navigation).

References: `server-rendering-with-streaming`, `server-rendering-without-streaming`, `loading-ui`, `loading-overview`, `intercepting-routes-soft-navigate`, `intercepting-routes-hard-navigate`, `intercepted-routes-modal-example`, `parallel-routes-auth-modal`, `conditional-routes-ui`, `ensure-static-stage`, `navigation-stage`.

Primitives: `browserWindow`, `skel.bar`, `skel.avatar`, `skel.square`, `skel.thumb`, `hole`, `card`, `arrow`, `bracketCaption`. Example: [scripts/diagrams/stages.mjs](scripts/diagrams/stages.mjs).

## Region map with badges

A browser window whose regions are outlined and tinted by category, each tagged with a letter badge (`S`/`D`, `A`/`B`), with callout labels on leader lines and a legend. The same badges can mark rows in a file tree and lines in a code panel so the three views cross-reference.

References: `thinking-in-ppr` (learn), `parallel-routes`, `parallel-routes-tab-groups`, `parallel-routes-cinematic-universe`.

Primitives: `browserWindow`, `card` (solid or dashed, any accent), `badge`, `callout`, `legendRow`, `codePanel`, `treePanel`.

## Zone graph

Dashed, color-coded zone boxes with a tag badge in the corner, mono route pills inside, and gray arrows between routes labelled with mono pills (`SOFT NAV`, `HARD NAV`).

References: `multi-zones`.

Primitives: `card` (dashed), `statusBadge`, `code`, `arrow`.

## Screenshots

Some images are product screenshots, not diagrams (`bundle-analyzer`, `inspector-*`, `instant-insight*`, `typescript-command-palette`, `macos-gatekeeper-*`, `opengraph-image*`, `background-image`, `fill-container`, `responsive-image`). Capture those from the real UI; this skill does not draw them.

## When nothing fits

Keep the canvas, grid, panel anatomy, type scale and accent meanings from [style-tokens.md](style-tokens.md), write the missing shape as a new function in `lib.mjs`, and add the finished diagram here as the first reference of its family.
