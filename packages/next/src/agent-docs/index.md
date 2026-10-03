# Next.js agent documentation

These version-matched documents help coding agents carry out Next.js adoption
workflows.
Read only the pages that match the current task, along with the public framework
documentation under `../docs/`.

## Adoption guides

- Adopt Cache Components: `adoption/cache-components/guide.md`
- Adopt Partial Prefetching: `adoption/partial-prefetching/guide.md`

Reusable runtime and optimization workflows remain Skills. They are not
duplicated in this version-matched agent-docs bundle.

## Gated entry points

Do not load these pages from the index during ordinary work:

- `next upgrade --agent` selects and provides the applicable pages under
  `upgrade/`.
- The managed agent-feedback instructions decide whether the hidden feedback
  command may provide `feedback/protocol.md`.
