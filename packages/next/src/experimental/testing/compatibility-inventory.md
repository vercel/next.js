# Next testing compatibility inventory

[`compatibility-inventory.json`](./compatibility-inventory.json) combines the
pinned Vitest 5.0.4 declarations with the reviewed implementation evidence in
[`compatibility-evidence.json`](./compatibility-evidence.json). Runtime capability
reporting includes this generated inventory through
[`capabilities.ts`](./capabilities.ts). Stable requirements remain in
[`NEXT_TESTING_STABLE_RELEASE.md`](../../../../../NEXT_TESTING_STABLE_RELEASE.md).

Each reference API retains its original name, surface and overload strings. The
version 2 schema replaces the old hardcoded `implemented` export flag with two
independent fields:

- `declaration` checks whether the actual Next facade exports the name or member.
  Availability establishes only that shape, not equivalent overloads, inference
  or runtime behavior. Configuration and ambient rows have no such export check.
- `implementation` records reviewed status and links to `evidenceGroups`. Read
  those groups for the implemented behavior, execution profiles, remaining gaps,
  runtime capability paths and maintained source, test and consumer evidence.

Implementation statuses describe progress within the stated scope:

| Status       | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| `scoped`     | Maintained evidence verifies a stated subset; broader conformance remains open. |
| `partial`    | Positive functionality exists alongside known gaps or unqualified combinations. |
| `missing`    | The target export or behavior is absent or has different semantics.             |
| `unreviewed` | A complete implementation/evidence review has not been recorded.                |

An absent facade export is recorded as missing even when the underlying internal
implementation has not been reviewed. A present export without behavioral
evidence remains unreviewed. Neither an accepted option name nor a diagnostic
refusing an unsupported feature establishes working functionality.

The summary counts reference entries, including aliases and types. These counts
are not independent features or an estimate of remaining implementation effort.

The separate `classification` retains the stable release assessment. Scoped
passing evidence does not make an entire API compatible across every overload,
modifier and profile. The current inventory grants no approved exceptions and
does not declare stable readiness or a supported version range.

Groups without a `rowApi` mapping remain visible in `evidenceGroups`. They cover
CLI selection/reporting/editor controls, coverage flags, Next rendering helpers,
Browser interactions and adoption/release work absent from the upstream
declaration list. Implemented CLI flags do not qualify rejected configuration
forms of the same feature. Likewise, a provider hook or a rendering helper does
not establish an entire provider or route contract.

`checkpoint` separates the implementation commit from the last coherent full
acceptance revision. Later build/static checks and targeted passing corpora do
not become a full acceptance result. Qualification, deferred work and historical
failures remain separate from implementation status.

To update the inventory from the repository root:

```bash
# Review implementation claims and maintained evidence paths first.
node scripts/next-testing-compatibility.mjs
node scripts/next-testing-compatibility.mjs --check
```

The generator extracts reference declarations and actual facade availability,
checks evidence API names, files and capability paths, and rejects drift. Edit
the evidence registry to record new verified behavior; do not hand-edit the
generated inventory or mark a diagnostic as an implementation.
