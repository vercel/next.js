# Stage-three packaged adoption gates

P3 owns the public package wiring, consumer fixtures and adoption documentation.
The five external-consumer gates below passed against immutable combined archives.
See [the runnable usage and migration guide](GUIDE.md).

The worktree started clean at `602a2aba900e45fb2edd694f463f435430678e1f`.
The accepted full stage-two snapshot was applied once; all 448 authored file
hashes matched `/tmp/next-testing-stage2-accepted-final-v1.json`.

## Immutable package inputs

L3 supplies three manifests alongside its immutable combined package archives:

- `artifacts.json`: package name to `{path, sha256}`.
- `source-manifest.json`: full producer `sourceSha256` and
  `native: {nativeSha256, sourceSha256, nativePath}`.
- `archive-verification.json`: `packages[name].files` maps every regular
  package-relative file to its SHA-256, including `package.json`.

`prepare-packed-stage3.mjs` consumes these archives without repacking a producer.
It copies and hashes the manifests and archives into a new evidence directory,
installs an external consumer, and compares complete installed regular-file sets
and bytes for Next, `@next/env` and the native package. The browser archive is
staged but not installed. Node/RSC production and coverage phases assert that
`playwright` and `@next/playwright` are absent. The separate production-browser
and mounting phases install the exact staged browser archive and Playwright,
then verify all four package file sets and bytes again.
Unexpected symlinks fail explicitly. The native package's provenance must match
both the native manifest and the full producer source inventory. L3 independently
audits those source hashes against the combined implementation.

No Vitest or Vite dependency, declaration overlay, repository resolution override,
or alternate compiler/runtime is used. Browser authoring uses the separately
installed Playwright packages. Installation verification alone is not execution
or TypeScript compatibility evidence.

## Execution and declaration gates

All commands in the updated `verify-packed.mjs`, including npm and TypeScript,
run through the accepted `runOwnedNode` supervisor. The verifier preserves command
logs before asserting success. Its process evidence retains parent-side spawn
records, missing startup records, detected workers and reclamation outcomes.

Both bundler and Node16 declaration checks must use strict mode, `allowJs`,
`checkJs`, and `skipLibCheck: false`. Their actual input lists must contain every
expected JS/TS authoring fixture and the installed public declarations. Type
success does not enable a runtime capability.

The verifier has separate `production-node` and `production-rsc` phases, each
with only its own JS/TS inputs and public declaration requirements. Initial Node
acceptance does not run an unsupported RSC profile or establish RSC/browser
authoring compatibility. Browser dependencies are installed only by the explicit
browser phases.

The final runtime matrix exercised these producers from installed packages,
recording actual native load paths and hashes:

| Gate                             | Consumer observation                                                  | Accepted result                       |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| Production Node                  | Production conditions and normal worker execution                     | 2 cases, distinct JS and TS           |
| Production RSC                   | Route-less async server-only render under production conditions       | 1 TypeScript case                     |
| Production browser driver        | Navigation and hydration against the built application                | 1 TypeScript case                     |
| Registered development component | Registered async server fixture, hydration, interaction under `/docs` | 2 cases, distinct JS and TS           |
| Development Node coverage        | Imported original source lines, JSON and text output, retry union     | 2 final cases, 3 attempts; 9/15 lines |

These gates do not rerun the full existing development-profile corpus. Its
acceptance remains separately attributed to L's combined integration evidence.

Production component mounting, browser/watch coverage, branch/function parity,
coverage-provider compatibility and wider static mocking remain outside this
stage. Coverage cannot be combined with snapshot updates (`--coverage --update`);
there is no shared report/snapshot commit transaction. The prepared negative
consumer command requires exit 1, the explicit combination diagnostic, no native
execution or run/case events, unchanged source/snapshot files, and no retained
output in its own temporary directory. The negative command passed this gate.

Isolated production profiles do not certify an ordinary application build
or the separately instrumented `instant()` application lane.

## Checks actually run

- All 448 baseline source hashes matched.
- Syntax checks pass for the updated packed verifier and immutable installer.
- Browser artifact verifier controls pass: distinct JS/TS cases are accepted;
  duplicate JS results with different case IDs, attempts and artifact paths
  cannot replace the missing TS case. A lone JS result also rejects. Evidence:
  `/tmp/next-testing-stage3-p3-artifact-controls-v1/`. These synthetic records
  validate the verifier only, not actual browser execution.
- Existing supervisor negative controls pass for a hung CLI, detached worker
  leak and immediate parent exit before worker startup. All six owned PIDs were
  reclaimed. Evidence: `/tmp/next-testing-stage3-p3-supervisor-v2/`.
- The first sandboxed control run failed because `/bin/ps` returned `EPERM`.
  It remains at `/tmp/next-testing-stage3-p3-supervisor-v1/`; the successful
  run used approved process inspection access.

The cumulative preparation adds distinct JS/TS basenames, including negative
mount declarations, to prevent TypeScript from omitting JavaScript inputs.
Browser artifacts must have unique real paths, belong to an expected actual
case/attempt, match every expected name/file pair exactly once, and appear before that attempt’s terminal result. Exactly one
screenshot and trace are required per browser attempt.

The coverage consumer retains two source modules across two workers. Only the
failed first retry executes the discount return; the successful retry takes the
normal branch. Uncalled exported functions stay reachable through identity
assertions. The verifier requires a separately reviewed expectation file with
exact source hashes and executable/covered line sets. It never creates passing
expectations from the report under test. L reviewed the actual map and source line sets independently before execution.
The exact reviewed oracle matched: 9/15 lines (60%). The metric counts original
lines with mapped nonwhitespace generated spans, including mapped delimiters;
eliminated syntax does not count. It is not statement, branch, or function parity.
The single intentional first-attempt assertion is checked for exact case, file,
retry identity, message, ordering, and source location. Every other phase retains
a zero-diagnostic requirement; coverage reports must remain complete with no errors.

## Final immutable evidence

All five phases passed on macOS arm64 using stock Node 24.21.0 at
`/tmp/next-testing-stage3-node-v24.21.0/node-v24.21.0-darwin-arm64/bin/node`.
Executable SHA-256:
`e4b5a3af0e05c75de2eae013904145f40fe7fc2a6e6f17510128bf45cca4e79b`.
Browser phases used Chromium installed by Playwright 1.61.0. This does not
establish additional engines or platforms. Older tested Node builds exhibited
an upstream symlink/FIFO `realpath` issue; this evidence does not redefine the
package's Node engine range.

- Immutable archives: `/tmp/next-testing-stage3-L3-packages-v1/`. Producer source
  remains frozen candidate v9. `artifacts.json` SHA-256:
  `6a2ea80e202d4e342f73ac70a478701d1244561dd29b51fd5f2281e5823c7522`.
- Prepared external consumer: `/tmp/next-testing-stage3-P3-consumer-v1/`.
  The exact runtime, source/native pairing, archive manifests and installed
  package inventory are retained there.
- Native SHA-256: `bf3a816d5b789d01340c913bfd20134a98b486baf413fcffb6ac4a522ce111d2`,
  paired with the 27 native source inputs in the producer manifest.
- Actual phase evidence directories:
  `/tmp/next-testing-stage3-P3-production-node-v1/`,
  `/tmp/next-testing-stage3-P3-production-rsc-v1/`,
  `/tmp/next-testing-stage3-P3-coverage-v1/`,
  `/tmp/next-testing-stage3-P3-production-browser-v1/`, and
  `/tmp/next-testing-stage3-P3-mounting-v1/`.
- `/tmp/next-testing-stage3-P3-acceptance-v1.json` hashes every retained evidence
  file. Its SHA-256 is
  `768d39117b98ef6edefdb52a9ec0858b1eab423726de1c7a80e78c139bc4a3b1`.
- Reviewed coverage oracle:
  `/tmp/next-testing-L3-reviewed-coverage-expectations-v1.json`, SHA-256
  `ef2cfc76ae2dad99e5f29bf2ea80e8f299b11789e4a3357c78ccfbf8cab23110`.
- Independent audit: `/tmp/next-testing-L3-packed-final-audit-v1.json`. L rehashed
  all installed files in the four packages, checked strict declaration inputs,
  runtime/native loads, original coverage line sets and retry attribution,
  verified browser artifact identities/order/trace actions and `/docs` URLs,
  and confirmed audited processes had exited.

The coverage-only verifier correction is
`/tmp/next-testing-stage3-p3-retry-after-runtime-v1.patch`, SHA-256
`ced6a3bc79317ecaad1bc06e3f0a8e8577b4a1a88a2ebbfae27efa568c7afe7e`.
It adjusts the expected intentional failed retry diagnostic without modifying
product archives or coverage output. Node/RSC ran before this verifier-only
correction; coverage and both browser phases ran after it. The producer remains
v9, while the root's v11 integration record also includes validation changes.
No previous rejected evidence was overwritten, and no installed files were
patched. All owned commands completed and P released the serialized build slot.
