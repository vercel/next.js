---
name: next-bundle-optimizer
description: >
  Audit and reduce Next.js browser initial-load work. Use for slow route startup,
  oversized client bundles, duplicate browser dependencies, or features that can
  wait for interaction.
---

# Bundle optimizer

## 1. Set the scope

Analyze the whole app by default, covering all routes and shared client dependencies. Narrow the scope only when the user specifies a route, dependency, feature or other subset. Choose **audit** or **fix** mode. Audit is the default: generate analyzer artifacts and report candidates while leaving application source, dependencies and lockfiles unchanged. Fix mode requires an explicit request to change the app. Ask before changing visible behavior, timing, compatibility or a trust boundary. For a route's static App Shell, use [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer); install it first if unavailable (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer`). For navigation prefetch work, use [`next-partial-prefetching-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-optimizer); install it first if unavailable (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-optimizer`).

**Done:** the whole-app or user-specified scope, mode and intended behavior are recorded. A request to capture or export data is audit mode, not permission to fix.

## 2. Capture and export a baseline

Run from the app directory with its package manager. Read `next analyze --help` for capture options and `next analyze export --help` for replay options in the installed CLI. Reuse a selected saved snapshot, or capture with a distinctive name first; then export it through gzip at its default compression level. Keep before/after `.jsonl.gz` files separate.

**Sandbox requirement:** If the agent’s sandbox blocks TCP port binding (as Codex’s does), it MUST run the `next analyze --output` capture outside the sandbox. Do not attempt the capture inside that sandbox, even though `--output` does not serve the analyzer UI.

Run the pipeline in Bash:

```bash
set -o pipefail
# Capture only when a new baseline is needed
pnpm exec next analyze --output --snapshot 'audit-before-unique-1'
pnpm exec next analyze export --snapshot 'audit-before-unique-1' | gzip > /tmp/analyze-app-before.jsonl.gz
```

`--output` builds and saves binary/UI artifacts without serving. `next analyze export` reads a saved snapshot without building; stdout is one typed JSON record per line, with errors on stderr. Omit `--route` for whole-app analysis; add it for a user-specified route. The route filter keeps the whole-app module graph, so scope it in the next step.

For a custom `distDir`, replay with `--dist-dir <configured-directory>` (relative or absolute): capture loads the app config, replay does not. `--snapshot <name>` selects a retained name; omission selects the newest snapshot. Capture generates a unique timestamp name when omitted, and **replaces** an existing capture when an explicit name is reused. Use distinct before/after names, including names with spaces, to preserve both baselines. For interactive exploration, capture without `--output` to serve the UI; `next build --analyze` also produces replayable data.

**Done:** the chosen capture is identified, export succeeded, and the baseline file, snapshot name and analysis scope are recorded. Check the whole pipeline's exit status before processing the compressed file: `pipefail` prevents gzip from hiding a failed export. Export validates one route at a time, so a failure can leave a partial archive even if `gzip -t` accepts it. Discard output when export or gzip fails.

## 3. Interpret the evidence

Resolve the schema from the app's **installed Next.js**, using its Node launcher:

```bash
pnpm exec node -p "require.resolve('next/analyze/graph-v1.schema.json')"
```

Read its descriptions for record meanings, joins, attribution and coverage. Stream decompression with `gzip -dc /tmp/analyze-app-before.jsonl.gz` into a line-oriented analysis script rather than loading the whole dump into context. Use the schema to interpret client/server contributions across every route in scope and choose the metric.

**Done:** the baseline's route-attributed client/server contributions and the metric are identified. Treat this as **build evidence**: claims about observed browser requests, timing or transfer savings need separate evidence.

## 4. Explain a candidate

Inspect actual project source and exact importers. Rank client-output contributions across the whole app, or within the user-specified scope, by attributed size, repetition, likely runtime cost, need before interaction and correctness risk.

### Community → min-cut pass

For broad audits seeking opportunities across multiple features or a large contributor list, run **community detection → target selection → directed min-cut → source validation** after the initial ranking. Read [Graph methods](references/graph-methods.md) before constructing the graph or running solvers.

1. Rank detected communities by scoped client-output attribution and inspect their inbound importers.
2. Select large communities, or optional feature regions within them, that can plausibly wait for interaction. Record why each selected region is optional under the route's render conditions.
3. Run directed min-cuts from the verified client roots to those targets to find small sets of importer changes that could detach them.
4. Validate the cut edges against source and behavior constraints; account for each investigated target as a candidate, rejected cut or evidence gap.

For a narrow audit of a named dependency or feature, use direct importer reasoning when it fully accounts for the relevant paths and proposed boundary; record why the paired pass adds no useful target discovery. If graph evidence or tooling blocks the pass, record the blocker and limit the conclusions accordingly.

### Graph-evidence checklist

Before proposing an edit, record these items for each candidate. Mark an inapplicable item with its reason; give missing evidence an explicit gap.

- **Scope:** name the affected routes, snapshot, render conditions, client/server output class, exact target identities and metric. For reachability claims, identify every selected client root, including applicable client references.
- **Coverage:** summarize relevant unsupported outputs and absent group triggers, and their effect on the claim. Scope conclusions to the known subgraph when completeness is uncertain.
- **Attribution:** count each selected output contribution once. Record repeated-record handling and distinguish source paths from module identities; explain any mapping used for solver weights and preserve unknown weights as gaps.
- **Reachability:** for a lazy boundary, check **all** synchronous root-to-target paths, alternate importers and cycles, including a target that is itself a root. Record which paths the proposed boundary severs and which stay reachable. Verify async and erased type-only imports against source.
- **Source checks:** inspect import triggers, mount-time preloading, module side effects and shared routes. Record the conditions under which an async import executes. The graph establishes indexed reachability; an after snapshot verifies emitted outputs and attribution changes.
- **Method:** record the chosen method, its parameters and why it fits the candidate.

For lazy interaction features, duplicate packages, server-rendered display work or other attributed assets, read the matching section in [Fix patterns](references/fix-patterns.md) before proposing an edit.

### Unexpected client dependencies

Size ranking can miss small server-owned modules in client code. Before scanning in either mode, read [Client dependencies](references/client-dependencies.md) for graph joins, generated Server Action identities and tracing. Stream the export to check every emitted client module, including async outputs.

Before editing, save a **Client-dependency scan** table in the report: one row per match and every client-imported Server Action, with **Source + client importer**, **Emitted identity**, **Routes**, **Compressed bytes** and **Disposition + evidence**. Reconcile source Action imports against emitted references, including generated identities; verify whether implementation contents survive. A filename search or byte ranking alone cannot complete this table.

Use three dispositions: **possible leak** requires server-only ownership evidence and surviving client contents; **suppressed** covers intentional client content and verified reference-only Action stubs; **unverified** names the missing evidence. Public form schemas, help text and editable prompts stay suppressed even under `server/` or `prompts` paths. Record coverage gaps (unsupported outputs, missing roots or mappings), explicitly stating when none were found.

**Done:** the community/min-cut pass accounts for every target or records its skip reason or blocker. Every size candidate has a completed checklist, exact source/importer, proposed edit and behavior checks. Every client-dependency match is a heuristic finding, suppressed with a reason or unverified with an evidence gap. Audit mode ends after the report.

## 5. Verify one change — fix mode only

Classify each proposed edit as a size optimization or boundary remediation before applying it. A request to reduce browser JavaScript authorizes size edits, including in public prompt modules and finding importers. Removing private client state/payloads, relocating policy or adding `server-only` needs separate explicit approval; leave those findings unresolved for the owner even if the UI would stay unchanged.

Make one small, cohesive change. Capture/export an after snapshot with a new name and compare the **same analysis scope, output class and metric** with the baseline. For whole-app analysis, account for changes across all routes, including shared dependencies. Run relevant behavior tests and type-check; use [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) when verifying the edit in the running app, and install it first if unavailable (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`).

If no relevant tests exist, create and run focused smoke tests. Test production imports or rendered UI, not copied implementations. Exercise interactive flows through a browser or executable component tests, including input handling, timing and deferred actions. For debounced search, check case-insensitive results and the existing delay; for editable lazy features, trigger loading and edit the result. Record commands/actions and observed results. Source inspection, type-checking and successful builds alone do not verify behavior.

**Done:** retain the change only when the scoped metric improves and the intended behavior passes its checks. Revert a change that fails either condition. If checks are blocked, report the unverified edit and blocker rather than accepting it. Record the accepted after snapshot as the next baseline before another edit.

## 6. Report and stop

Audit reports candidates; fix reports accepted edits and any reverted or unverified attempts. Include snapshot names, scoped attribution/deltas, exact source/importer, behavior-check results and blockers. For a graph cut, include its route/render conditions, roots/target and unknowns. Distinguish source facts, build evidence, heuristics and separately observed runtime facts.

Add a **Possible server-only leaks** section with five labeled lines per heuristic finding: **Module**, **Routes**, **Chain**, **Heuristics** (including ownership evidence) and **Compressed bytes**. Explain missing values on their lines. Keep unresolved boundary concerns separate from accepted size edits, including those in the same file. State when no leaks were found.

Use the scan table to populate **Suppressed matches** and **Evidence gaps**. Keep public form content and verified Action stubs outside the leak section, along with naming concerns. Include the coverage statement even when no gaps were found.

**Done:** every scoped candidate, leak finding, client-imported Action and attempted edit is accounted for, with evidence or a stated gap.
