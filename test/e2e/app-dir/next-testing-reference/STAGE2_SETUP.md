# Independent compiled setup acceptance

Exact dispatch: I2 setup-v2 b9f0b926907501cb4473fdcae372218489196877b2edcd1b98fa336e96e11bd7; A2 setup-v2 9c15cae5bb8910d3343a4e520a3d745f9c85c44a1c7d5030d4fb4aa9592fa286; B2 setup-v1 a4f18da204bfa4ada24ab26416a3dd092e94d6742363da7d214b948c3a3a7987, in that order on accepted stage-two baseline. Own setup prep v1/v2 was verified cumulatively and not reapplied. All three reverse checks pass.

Native 6d479c93716648bedd08132957507f8510044568ca92be2db99030966f985f58 matches all17 live and immutable Rust sources in /tmp/next-testing-stage2-setup-integrated.json; reverified after bootstrap. Previous db757 native preserved separately. Actual CLI dlopen checks exact local realpath and SHA.

Full bootstrap passed18/18,85.596s. Initial sandboxed attempt failed local loader port binding; permitted rerun passed, no cache clearing. Package declarations passed within bootstrap. Root types authoritative post-bootstrap run exit0; premature concurrent run had sole missing newly emitted setup declaration, preserved separately.

Actual CLI temporary Node+RSC profiles: two spec files each, four files/four cases passed. Fixtures assert asynchronous setup ordering before spec, shared TypeScript subject and state, sequential hooks and both cleanups, and fresh file state. Negative profiles both exit in collection failure: two failed files, zero cases, original reject.mjs:8:7, later setup/spec markers absent. CLI exits naturally under bounded240s harness. Config restored to original five profiles in finally. Initial checker expected line9 by mistake; actual throw is line8, verified by saved-output analysis without rerunning CLI.

Normal test-dev-turbo compiler corpus passed17/17,2suites,99.862s, including actual childProcesses and workerThreads loaders and sequential session disposal. NODE_OPTIONS enforces exact native audit in spawned Node processes.

Default actual CLI passed5profiles/9files/13finalcases/18attempts with5 intentional retry errors retained. Six valid screenshot/trace artifacts have unique correct attribution; actual server/Chromium PIDs gone, disposal precedes file-end, application flock released. Real ready-marker SIGINT exit130 likewise preserves2 valid artifacts, cancelled outcomes, next case body never runs, resources gone and lock released.

SIGTERM also passed130 after the sole fixture change: explicit30s navigation
instead of default10s, within the existing60s case budget. Initial pre-signal run
failed at page.goto before readiness; trace shows document200 after9.81s and
successful script responses thereafter. No signal was sent in that failed run;
it is not cancellation evidence. Its raw log/trace remain intact and owned
processes were disposed. The changed fixture reached readiness and real SIGTERM
produced cancelled outcomes,2valid artifacts, no next test body, disposal before
file-end, dead owned processes and released lock. Formatting and ESLint pass.

Ordinary production regression passed3/3,37.141s: normal dynamic rendering,
pending testing cookie cannot pause real navigation/hydration, and inspected
application output/traces omit testing dependencies/implementation markers.
This retains PRODUCTION.md's bounded scan claim; it does not prove every testing
symbol is absent. No runtime implementation changed during verification.

Final patch reverse checks and native/17source hashes pass; original five-profile
config restored. No active L watcher/server/test remains. Unchanged258unit tests
were deliberately not rerun. No snapshots, mocks, watch, public packaging, browser setup, production test profiles, or arbitrary cancellation between setup imports accepted by this batch.

## Captured evidence

All commands ran in L's checkout against the exact dispatch. Logs were captured
once. `/tmp/next-testing-L-stage2-setup-` prefixes these files:

- `build-all.log`: sandbox port-bind failure; `build-all-permitted.log`:18/18.
- `root-types.log`: premature declaration miss; `root-types-after-build.log`:0.
- `positive.log`, `positive.events.jsonl`, `positive.result.json`:4files4cases.
- `rejection.log`, `rejection.events.jsonl`, `rejection.result.json`:2failures0cases.
- `cli-driver.log`: checker line-number error, resolved using saved evidence.
- `compiler.log`: normal `pnpm test-dev-turbo` setup+node compiler suites17/17.
- `default.log`, `default.events.jsonl`, `default.result.json`: actual default CLI.
- `browser-cancel-sigint.*`: accepted real SIGINT.
- `browser-cancel-term-sigterm.*`: failed navigation before signal, preserved.
- `browser-cancel-term-sigterm-timeout30.*`: accepted real SIGTERM.
- `production.log`: `pnpm test-start-turbo` ordinary production suite3/3.

Audit preload `/tmp/next-testing-L-native-audit-stage2-setup.cjs` checks exact
native realpath/hash. `/tmp/next-testing-L-browser-audit-stage2-setup.cjs`
observes real reporter events and browser/server acquisition/disposal.
`/tmp/next-testing-L-stage2-setup-cli.py` selects temporary Node/RSC profiles and
restores config in finally. The saved negative result documents its line-number
checker correction. `/tmp/next-testing-L-stage2-setup-browser-driver.py` sends
signals only after the readiness marker and validates artifact contents,
attribution, terminal ordering, process disposal and flock release.

This evidence supersedes only the setup gate's earlier unselected/preparation
status in STAGE2_ACCEPTANCE.md. All earlier milestone logs remain immutable.
