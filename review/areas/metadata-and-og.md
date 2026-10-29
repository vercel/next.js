# Metadata and OG

<!-- Owners and paths: the [metadata-and-og] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `generateMetadata`/`viewport` resolution, metadata file conventions (icons, sitemap, robots, opengraph-image routes), streaming metadata insertion, and `ImageResponse`.
- TODO: key files and the invariants that must hold

## What failure looks like

- Wrong or missing `<title>`/OG tags, metadata routes 404, bots receive streamed (not blocking) metadata, duplicate head tags on navigation.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to the bot/blocking-metadata decision or to metadata route path matching (medium); new metadata fields reaching the public type (strong, public API).
- TODO

## Rules

- TODO

## Preferences

- TODO
