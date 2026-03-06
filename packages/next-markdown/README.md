# `@next/markdown`

Internal Markdown serialization package used by Next.js experimental Markdown
output.

## Status

`@next/markdown` is a private package. It is not a supported public API and may
change without notice.

## What it does

This package contains the generic React-to-Markdown logic used by Next.js:

- React tree instrumentation for Markdown-specific markers
- direct React tree rendering into an in-memory Markdown tree
- root and segment-level component overrides
- default heuristics for omitting interactive controls

Next.js-specific routing, content negotiation, and route export handling live in
`packages/next`.

## Internal API

The package currently exposes:

- `markReactNode`
- `renderReactToMarkdown`
- marker constants
- Markdown component and segment types

## Development

```bash
pnpm --filter @next/markdown build
```
