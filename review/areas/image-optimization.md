# Image Optimization

<!-- Owners and paths: the [image-optimization] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `next/image` (new and legacy components, `getImgProps`), the `/_next/image` optimizer (sharp pipeline, remote/local pattern matching, cache), and the image loaders for both bundlers.
- TODO: key files and the invariants that must hold

## What failure looks like

- Cache key omitting a query so one user's image serves to another, wrong `Content-Type`/`Cache-Control`, layout shift from changed `sizes`/`srcset`, SVG served without `Content-Disposition`.
- TODO: past regressions and reverts, with links

## Escalate when

- `srcset`/`sizes` generation (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
