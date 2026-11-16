# Webpack Config and Loaders

<!-- Owners and paths: the [webpack-config-and-loaders] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The webpack/rspack bundler integration: `webpack-config.ts`, config blocks, loaders and plugins not claimed by another area, aliases/externals, the RSC module graph (client/server reference boundaries, `flight-client-entry-plugin`), barrel optimization, and the `next-rspack` shim.
- TODO: key files and the invariants that must hold

## What failure looks like

- A module ends up in the wrong layer (server code in a client chunk, or `react-server` condition missing), duplicated React copies, client-reference manifest missing an export so a client component is `undefined` at runtime, chunk hashing changes causing skew, slow builds.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to layer/condition names, `flight-client-entry-plugin.ts` manifest emission, externals handling, or alias tables (medium; strong if it changes what a user can import).
- TODO

## Rules

- TODO

## Preferences

- TODO
