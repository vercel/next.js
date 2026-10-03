# Next.js agent documentation

These version-matched documents help coding agents carry out Next.js workflows.
Read only the pages that match the current task, along with the public framework
documentation under `../docs/`.

## Workflows

- Runtime verification: `workflows/next-dev-loop/workflow.md`
- Adopt Cache Components: `workflows/next-cache-components-adoption/workflow.md`
- Optimize a Cache Components route: `workflows/next-cache-components-optimizer/workflow.md`
- Adopt Partial Prefetching: `workflows/next-partial-prefetching-adoption/workflow.md`
- Optimize Partial Prefetching: `workflows/next-partial-prefetching-optimizer/workflow.md`

## Gated entry points

Do not load these pages from the index during ordinary work:

- `next upgrade --agent` selects and provides the applicable pages under
  `upgrade/`.
- The managed agent-feedback instructions decide whether the hidden feedback
  command may provide `feedback/protocol.md`.
