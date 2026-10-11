# Independent internal watch checkpoint

Exact coordinator dispatch `/tmp/next-testing-stage2-watch-preflight-v2.patch`,
SHA256 `794910f8afe0050327dbf7b6bbebf15fe6176dfa471fe951ad35eb48e740ac3c`,
was applied once onto accepted public snapshot CLI state. All 49 after hashes in
`/tmp/next-testing-stage2-watch-integrated-v1.json` match before and after checks;
reverse application check passes. The increment combines A lifetime-v5,
B broker-v4 and marker guard, J watch-v5, and I watch-v2 plus reviewed fixes.
Accepted native `6d479c93716648bedd08132957507f8510044568ca92be2db99030966f985f58`
and all 17 Rust source hashes remain unchanged. No mock graph/native or public
watch activation was applied.

## Checks actually run

- `CI=1 pnpm --filter=next build`: passed including declarations, 22.83s.
- `pnpm typescript`: passed against the unchanged root configuration.
- Explicit focused Jest paths for J watch, B execution broker, I CLI, compiler,
  and execution: **170/170 across five suites**, 18.188s. Includes corrected
  direct-child exit handling, metadata ownership diagnostics, subscription and
  root-inode failures, scheduler recovery/coalescing, broker cleanup/transport
  ownership failures, and compiler allocator/lifetime checks.
- Normal `pnpm test-dev-turbo` command selecting generated watch CLI, broker
  compiler, and setup compiler suites: **12/12 across three suites**, 52.558s.
  These are actual compiler/worker executions, not mocked implementations.

The watch suite's two cases call internal `watchTests`; despite the suite name,
they do **not** prove public `next test --watch` execution. Reload changes actual
Next config alias and output directory, `.env.local`, and setup code. It verifies
fresh first/second values and single setup execution in new evaluated file realms.
Crash sends SIGKILL to the audited generation coordinator while a file runs and
requires a failed outcome, never a passing summary. Both cases verify recorded
compiler, file and loader PIDs are gone and artifact directories were removed.
The independent saved reload/crash evidence contains only accepted 6d479 loads.

The four broker cases exercise actual environment forwarding, cancellation,
coordinator crash and transport-send failure; actual worker ownership closes
before completion and retained artifacts obey parent lifetime. The six compiler
cases cover ordered async setup with child-process and worker-thread loaders,
parent-allocated immutable output after source mutation, RSC server context,
Node poison boundary, and setup rejection preventing later setup/spec evaluation.

## Evidence and bounds

Logs use `/tmp/next-testing-L-stage2-watch-`:
`build.log`, `root-types.log`, `focused.log`, and `actual.log`.
`owner-evidence/reload.json` and `owner-evidence/crash.json` retain raw output,
actual native load records, managed PIDs and verified outcomes. Native preload:
`/tmp/next-testing-L-native-audit-stage2-setup.cjs`; fixture native audit also
checks the expected SHA. No cache clearing, type relaxation or runtime repair was
needed during this exact checkpoint. No L build/watch/worker remains active; L
released its owned heavy slot and notified I for the next bounded owner checks.

This is an **internal checkpoint only**. Public watch remains unsupported in the
capability inventory. Additional actual Node/RSC source/spec additions, removals,
rapid in-flight edits, compile/test failure recovery and signal cancellation are
planned in `/tmp/next-testing-L-stage2-watch-acceptance-plan-v1.md`.
`/tmp/next-testing-L-stage2-watch-mutations.cjs` is prepared but **unrun**; it is not
acceptance evidence. Coordinator sequencing defers those expanded probes to the
final reviewed compiler pair and public activation increment, avoiding duplicate
runs. Public CLI proof must execute the real command after separately reviewed
activation. Browser watch and snapshot updates in watch remain unsupported.
