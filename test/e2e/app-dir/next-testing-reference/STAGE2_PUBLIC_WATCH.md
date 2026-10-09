# Independent public watch and ordinary application checkpoint

Exact public-watch increment SHA256
`99763be61dbfe639cf31f2ad8e4f4c2fe7d606f07642e1fd41d1884c57f22ed4`
from `/tmp/next-testing-stage2-public-watch-preflight-v1.patch` was applied to
accepted internal watch and mock/lifecycle source. All seven after hashes in
`/tmp/next-testing-stage2-public-watch-integrated-v1.json` matched; reverse check
passed. The separately reviewed two-file inventory increment SHA256
`3cbd8a280b88f1737a7e791ae98d966901139c6dc2a23a8ad509f72090968cea`
was applied before the single final core rebuild. No fixture or assertion was
changed during these checks. All 21 native inputs remain paired with d62.

## Public watch proof

- Core rebuild including declarations: passed, 23.29s.
- Unchanged-root `pnpm typescript`: passed.
- Exact focused CLI/ownership/inventory suite: **73/73**, 8.022s.
- Actual `next test --capabilities`: watch, static factory mocks and one-shot
  snapshot updates supported with the reviewed restricted scopes; production
  remains unsupported. This is inventory-output proof, not a substitute for
  individual runtime gates.
- Normal `pnpm test-dev-turbo` generated watch suite: **7/7**, 37.929s, audited
  native `d62aeb2983c6d90c5527a63a3b9b7a0d6313f2181515ca6f78b818d770017fc6`.

The seven-case suite includes real public `next test --watch` in Node and RSC,
config/alias/output/environment/setup changes, SIGINT exit 130 and verified PID
and artifact cleanup. The RSC variant imports a server-only module, proving the
server layer rather than only changing a profile label. Existing internal reload
and crash checks also pass on this final compiler pair. Controlled stuck/leaking
CLI probes verify the harness detects failure and reclaims recorded detached
children; they do not count as successful application runs. Browser, production,
route-context and snapshot-update watch requests reject before native compilation.

Evidence prefix `/tmp/next-testing-L-stage2-final-`:
`build.log`, `root-types.log`, `cli-focused.log`, `capabilities.json`,
`public-watch.log`, and `public-watch-evidence/` (reload/crash/public-node/public-rsc
raw output, native records and ownership checks).

## Ordinary application regressions on d62

The unchanged canonical default command passed **five profiles, nine files,
13 final cases across 18 attempts**, 21.643s. Five intentional failed retry
attempts remain in the report. Six screenshot/trace artifacts are valid, uniquely
attributed and precede their terminal case events. Actual server/Chromium PIDs
are gone, parent disposal precedes file-end and the application flock is released.
Evidence: `default.log`, `default.events.jsonl`, `default.result.json` under the
same prefix.

Normal `pnpm test-start-turbo` ordinary-production omission suite passed **3/3**,
17.979s: dynamic rendering, pending testing-cookie navigation/hydration, and
bounded emitted-output/dependency inspection. PRODUCTION.md's scan limits still
apply; this is not a claim that every testing symbol disappears. Evidence:
`production.log` under the same prefix.

## Still separate

This accepts the bounded public-watch behavior above, not whole stage two.
Expanded source/spec add/remove/rapid mutation probes remain pending strengthened
validation. The first Node mutation driver is diagnostic only: it reached held
cancellation/latest success but its final artifact assertion matched a directory
predating the run. All recorded PIDs were gone and config/temporary files were
restored. Its cancellation ordering and failure cleanup checks were subsequently
strengthened and sent for review; no acceptance is inferred from that first run.

External mocked-consumer negative cases also remain unaccepted: review found
expected unsupported errors accompanied by unexpected Turbopack fatal/missing
telemetry output. Their clean diagnostic gate awaits the owner's source fix and
exact-pair verification. Positive/package-type evidence is distinct. Browser
watch, watch snapshot updates, production test profiles and general source-graph
precision remain unsupported. Existing completed evidence is retained even if a
later exact compiler pair requires a bounded recheck.
