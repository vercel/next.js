# Independent authoring and snapshot transport acceptance

Exact source: accepted setup6d479 plus P2package-v1,
P2fixture-v2 and coordinator combined snapshot-candidate-v2 SHA
123cb5be483ed39f01c662dbce3853a6667947e57bcc13885924c76b5fbf8c56.
No individual C/B/G checkpoint was additionally layered. All122source hashes in
/tmp/next-testing-stage2-authoring-integrated-v1.json match before and after build.
The initial sole metadata mismatch was coordinator-owned NEXT_TESTING_CONTRACTS.md;
its explicitly dispatched authoritative copy was verified and synchronized.
Accepted6d479 native and all17Rust inputs remain unchanged. Mock graph/watch/broker
candidates were not applied.

Frozen pnpm install passed, replacing only the patched snapshot dependency.
Core Next build/declarations passed46.48s. Root pnpm typescript passed0. The actual
hoisted Octokit GraphQL remains7.0.1 with no exports restriction and its private
types file present; C's GraphQL9 dependency failure was not reproduced here.
No dependency symlink, source cast or type/config relaxation was used.
Evidence /tmp/next-testing-L-stage2-authoring-octokit.json.

Changed focused suites passed71tests/6suites. Real normal test-dev-turbo combined
B/C compiled suites passed8/8,46.351s, including ordered async setup and shared
matcher/hooks/state, actual spy restoration after rejection, compiled failure
listeners, and passing payload followed by nonzero exit or late failure retaining
original snapshot bytes. These checks use the final reviewed C implementation,
not B's earlier checkpoint.

Four new unselected canonical modules support six independent compiled Node
transport probes. /tmp/next-testing-L-stage2-authoring-compiled.cjs compiles real
artifacts in the canonical app, shuts down the native graph, then calls the actual
execution parent. It restores or removes every temporary source snapshot in
finally. It does not invoke the parent commit helper directly or substitute a
worker. Exact native load is audited by the accepted setup preload.

- Successful explicit update commits updated bytes and preserves skipped/absent entries.
- Default read-only mismatch fails and leaves original bytes identical.
- Retry rollback commits only final-attempt values, discards newly introduced failed-attempt keys and preserves unchecked originals.
- Final selected attempt without snapshots preserves every byte, including authored formatting, even after a failed snapshot-producing attempt.
- External edit on the real case-end event occurs before awaited disposal; commit fails with original-baseline conflict and preserves the external edit.
- Worker sends real passed terminal payload with one staged plan; its send callback is held until cancellation. The parent aborts only after the payload marker, returns cancelled despite the passed case, and leaves original bytes identical.

All six probes passed. The cancellation module is intentionally isolated and
unselected by the canonical default config. It intercepts only the terminal send
callback to make the otherwise narrow parent cancellation window deterministic;
the real compiler, worker, IPC payload, process exit and commit gate remain in use.
No arbitrary mock implementation or public snapshot CLI capability is implied.

Fresh external consumer acceptance passed using actual locally packed Next,
@next/env, @next/playwright and matching6d479 native tarballs. Clean npm install
occurred outside the repository; Node and RSC authoring/execution passed before
browser dependencies were installed, with vitest/vite/playwright resolution
explicitly absent. Packed Node3/RSC2/browser2cases passed through actual CLI.
Four strict/checkJs/skipLibCheck:false checks passed (bundler and node16 for both
authoring and browser), and each actual tsc program contains every expected JS/TS
input by realpath. Native dlopen records prove installed consumer-local6d479:
Node1,RSC1,browser3loads. No repository module/native fallback. Evidence directory
/tmp/next-testing-L-stage2-authoring-packed-v1 includes passed.json, tarball hashes,
all command logs, native records and four type-input manifests. A supplementary
readback comparison initially used literal /tmp against /private/tmp realpaths;
resolved-path comparison passes on saved evidence without rerunning execution.

Public --update stays gated pending I2's separately reviewed CLI integration.
Additional bounded actual RSC compile+execute probes passed3/3 using the same
6d479 compiler: successful update preserves unchecked/skipped entries; read-only
mismatch fails without writing; external edit before disposal rejects commit and
preserves user bytes. Evidence /tmp/next-testing-L-stage2-authoring-rsc-\*.
The six adversarial/retry probes above are Node-specific; browser/watch snapshot
updates remain unsupported. This batch does not accept mock graphs, watch,
production test profiles, inline/raw/custom snapshot environments, snapshot
pruning or general Vitest ecosystem compatibility. First-batch unchanged full
browser/production/compiler regressions were not repeated.

## Commands and evidence

Prefix `/tmp/next-testing-L-stage2-authoring-`:

- `install.log`: `pnpm install --frozen-lockfile --ignore-scripts`.
- `build.log`: `CI=1 pnpm --filter=next build`, including declarations.
- `root-types.log`: unchanged root `pnpm typescript`, exit0.
- `unit.log`: six explicit Jest paths via `pnpm exec jest --runTestsByPath ... --runInBand`,71/71.
- `compiled.log`, `compiled-passed.json` and six mode JSON files: independent Node transport.
- `rsc-compiled.log`, `rsc-compiled-passed.json` and three mode JSON files: independent RSC transport.
- `mode-suites.log`: normal `pnpm test-dev-turbo` B compiled-setup and C stage2-api suites,8/8.
- `packed-v1.log` and `packed-v1/`: fresh external tarball/type/runtime verification.
- `fixture-format.log`, `fixture-lint.log`: four authored canonical module checks.

Exact snapshot transport driver paths are retained beside these logs. Canonical
modules remain unselected in the original five-profile JSON config. Temporary
snapshot files are restored/removed; all122manifest files and17native source
hashes were reverified, with accepted6d479 untouched. No L build/watch/worker
remains active. L released its heavy slot; A subsequently granted the short RSC
probe window under A ownership and was notified immediately when it finished.
