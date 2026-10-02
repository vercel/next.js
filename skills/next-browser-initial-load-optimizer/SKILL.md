---
name: next-browser-initial-load-optimizer
description: >
  Audit and reduce Next.js browser initial-load work. Use for slow route startup,
  oversized client bundles, duplicate browser dependencies, or features that can
  wait for interaction.
---

# Browser initial-load optimizer

## 1. Set the scope

Choose a route and **audit** or **fix** mode. Audit is the default: generate analyzer artifacts and report candidates while leaving application source, dependencies and lockfiles unchanged. Fix mode requires an explicit request to change the app. Ask before changing visible behavior, timing, compatibility or a trust boundary. For a route's static App Shell, use `next-cache-components-optimizer`; for navigation prefetch work, use `next-partial-prefetching-optimizer`.

**Done:** the route, mode and intended behavior are recorded. A request to capture or export data is audit mode, not permission to fix.

## 2. Capture and export a baseline

Run from the app directory with its package manager. Read `next analyze --help` for capture options and `next analyze export --help` for replay options in the installed CLI. Reuse a selected saved snapshot, or capture with a distinctive name first; then export it through gzip at its default compression level. Keep before/after `.ndjson.gz` files separate. Run the pipeline in Bash:

```bash
set -o pipefail
# Capture only when a new baseline is needed
pnpm exec next analyze --output --snapshot-name 'audit-before-unique-1'
pnpm exec next analyze export --snapshot-name 'audit-before-unique-1' --route '/dashboard' | gzip > /tmp/analyze-dashboard-before.ndjson.gz
```

`--output` builds and saves binary/UI artifacts without serving. `next analyze export` reads a saved snapshot without building; stdout is one typed JSON record per line, with errors on stderr. The route filter keeps the whole-app module graph, so scope it in the next step.

For a custom `distDir`, replay with `--dist-dir <configured-relative-dir>`: capture loads the app config, replay does not. Use a unique name or generated ID for reproducibility; a name must match exactly one retained capture. If replaying older snapshots saved under `.next`, select that directory explicitly. For interactive exploration, capture without `--output` to serve the UI; `next build --analyze` also produces replayable data.

**Done:** the chosen capture is identified, export succeeded, and the baseline file, snapshot ID and selected route are recorded. If capture is blocked, obtain a permitted environment or an existing snapshot and report the gap. Check the whole pipeline's exit status before processing the compressed file: `pipefail` prevents gzip from hiding a failed export. Export validates one route at a time, so a failure can leave a partial archive even if `gzip -t` accepts it. Discard output when export or gzip fails.

## 3. Interpret the evidence

Resolve the schema from the app's **installed Next.js**, using its Node launcher:

```bash
pnpm exec node -p "require.resolve('next/analyze/graph-v1.schema.json')"
```

Read its descriptions for record meanings, joins, attribution and coverage. Stream decompression with `gzip -dc /tmp/analyze-dashboard-before.ndjson.gz` into a line-oriented analysis script rather than loading the whole dump into context. Use the schema to interpret the selected route's client/server contributions and choose the metric.

**Done:** the baseline's route-attributed client/server contributions and the metric are identified. Treat this as **build evidence**: claims about observed browser requests, timing or transfer savings need separate evidence.

## 4. Explain a candidate

Inspect actual project source and exact importers. Start with the named route or rank scoped client-output contributions by attributed size, repetition, likely runtime cost, need before interaction and correctness risk. Choose a lazy boundary only after tracing **all** synchronous importer paths, alternate roots and cycles; check whether the import is already async or type-only and erased. Check side effects, runtime behavior and shared routes.

Use direct importer reasoning when it explains the candidate. For **clustering** or a route-specific **min cut**, read [Graph methods](references/graph-methods.md) before choosing or running a solver. For lazy interaction features, duplicate packages, server-rendered display work or other attributed assets, read the matching section in [Fix patterns](references/fix-patterns.md) before proposing an edit.

**Done:** each candidate names the route, snapshot, source/importer, client/server scope, target, metric, proposed edit, behavior checks and evidence gaps. Label heuristics as heuristics; the report step completes **audit** mode.

## 5. Verify one change — fix mode only

Make one small, cohesive change. Capture/export an after snapshot with a new name and compare the **same route, output class and metric** with the baseline. Run relevant behavior tests and type-check; use `next-dev-loop` when verifying the edit in the running app.

**Done:** retain the change only when the scoped metric improves and the intended behavior passes its checks. Revert a change that fails either condition. If checks are blocked, report the unverified edit and blocker rather than accepting it. Record the accepted after snapshot as the next baseline before another edit.

## 6. Report and stop

Audit reports candidates; fix reports accepted edits and any reverted or unverified attempts. Include snapshot IDs, scoped attribution/deltas, exact source/importer, behavior-check results and blockers. For a graph cut, include its route/render conditions, roots/target and unknowns. Distinguish source facts, build evidence, heuristics and separately observed runtime facts.

**Done:** every scoped candidate or attempted edit is accounted for, with evidence or a stated gap.
