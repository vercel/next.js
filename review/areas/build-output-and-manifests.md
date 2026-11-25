# Build Output and Manifests

<!-- Owners and paths: the [build-output-and-manifests] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `next build` orchestration and what it writes: all `*-manifest.json` files, `prerender-manifest`, routes manifest, standalone output + NFT traces, `output: 'export'`, the adapter API, build-id and deployment-id handling.
- TODO: key files and the invariants that must hold

## What failure looks like

- A manifest field renamed or reordered breaks the Vercel builder or self-hosters' adapters; standalone output missing a traced file (500 at runtime); export writing HTML for a dynamic route; non-deterministic builds; build-id changes causing skew.
- TODO: past regressions and reverts, with links

## Escalate when

- Any change to a manifest's shape or file name, or to standalone/export directory layout (strong: these are public build output); changes to `prerender-manifest` classification (medium, shared with app-prerender).
- A change that can drop a file needed at runtime from NFT traces, such as a new ignore pattern or a narrower include (strong: a missing traced file is a 500 at runtime). An ignore that only carries an existing ignore over to files that were moved or split is a comment. A wider include is medium: it grows every deployment.
- A trace snapshot that changes only because the PR adds or moves an import is a comment: say whether the new file is expected.
- TODO

## Rules

- TODO

## Preferences

- TODO
