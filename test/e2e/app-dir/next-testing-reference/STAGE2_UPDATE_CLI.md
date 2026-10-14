# Independent public snapshot CLI acceptance

Exact separable CLI increment: /tmp/next-testing-stage2-I2-update-candidate-v2.patch,
SHA2561e6a126ed1b6b0e254ac657f7f94fcd84b8af0aacf682eed65b673404e0262a0,
applied to accepted authoring/package and L acceptance state. All15initial source
hashes match /tmp/next-testing-stage2-update-integrated-v1.json; reverse check
passed. Native6d479 and17Rust source inputs are unchanged. No watch, broker,
allocator, static-mock types or graph candidate was applied.

Core Next rebuild and declaration generation passed21.07s. Exact separable
focused CLI suite passed65/65,0.428s. The owner's73 count includes8 watch cases
intentionally excluded from this increment; L does not claim73 on these bytes.

Normal mode-specific actual command passed4/4,30.47s:
`pnpm test-dev-turbo test/development/app-dir/next-testing-update-cli/next-testing-update-cli.test.ts`.
The suite invokes the real public `next test` command in an isolated installation:

- Default `--run` fails snapshot mismatches and preserves Node/RSC bytes.
- Explicit `--run --update` passes both profiles, updates selected snapshots and
  preserves skipped and unrelated entries.
- Failure after staging under `--update --project node` and `--project rsc`
  fails and leaves both source snapshots unchanged.
- Mixed browser selection with `--update`, `--list --update` and
  `--watch --update` all reject before any native load or snapshot write.

Seven raw subprocess evidence files are retained in
/tmp/next-testing-L-stage2-update-evidence-v1. Four execution subprocesses each
record one actual native load at L's exact accepted native path/hash; three early
preflight failures record zero loads. Independent saved-evidence summary is
/tmp/next-testing-L-stage2-update-evidence-summary.json. Both preload and fixture
native audit enforce6d479. No mock compiler/executor was used in these four cases.

The first root type check found one real own-fixture TS2322 at the subprocess
result's code property (string|number inferred where number required). It is not
an Octokit/dependency issue. I's bounded fix explicitly narrows numeric code after
the existing nonnumeric rejection, with no cast, type/config relaxation or runtime
implementation change. The coordinator reviewed and dispatched the exact correction
/tmp/next-testing-stage2-I2-update-types-after-v2-v1.patch, SHA256
a3ea3911d959410f918343e12419fc6c1faed4b12d1b869a03f05420d4427bc1.
Apply/reverse checks pass. Authoritative unchanged-root `pnpm typescript` now
passes exit0 (`root-types-corrected.log`). The initial failure remains retained.
Runtime checks were not rerun for this equivalent numeric narrowing; the updated
fixture is the only file differing from the initial15source manifest.

Logs prefix /tmp/next-testing-L-stage2-update-: build.log,focused.log,
root-types.log,integration.log. Existing authoring transport/package and setup
regressions were not repeated unchanged. Public update scope is one-shot,
route-less development Node/RSC only; unchecked entries are always preserved.
Browser/watch updates remain unsupported. Existing Node/RSC parent write safety
gates are documented in STAGE2_AUTHORING.md; this narrow batch verifies their
public CLI wiring. Other capabilities remain separately gated.

Public one-shot snapshot update CLI is independently accepted within these bounds.
This completes the public-wiring gate previously pending in STAGE2_AUTHORING.md;
it does not widen any other capability. Earlier evidence remains immutable.
No L build, watcher, worker or test process remains. The final bounded typecheck
was coordinated with A while A retained its own slot; L did not alter that slot.
