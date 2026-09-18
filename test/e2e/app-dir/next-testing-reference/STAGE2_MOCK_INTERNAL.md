# Independent static factory mock checkpoint

The single reviewed increment `/tmp/next-testing-stage2-mock-preflight-v1.patch`
(SHA256 `a3616206f3b1e0b50ccab9c82e6c007e271ffcfc835efd742327ab0dac7e0eb4`)
was applied after accepted internal watch. All 64 changed source hashes match
`/tmp/next-testing-stage2-mock-integrated-v1.json`; reverse check passes.
The later full 251-file manifest also matched exactly before the test-only
lifecycle install correction described below.

Native `d62aeb2983c6d90c5527a63a3b9b7a0d6313f2181515ca6f78b818d770017fc6`
matches all 21 live and immutable archived Rust/Cargo inputs. Prior accepted
6d479 remains preserved separately. Actual dlopen auditing checks exact local
realpath and SHA. No public watch/static-mock inventory activation was applied.

## Independent checks

- Full `CI=1 pnpm build-all`: **18/18**, 37.525s, including declarations.
- Unchanged-root `pnpm typescript`: passed.
- Focused mock registry, compiler and execution suites: **82/82**, three suites,
  3.1s.
- Normal `pnpm test-dev-turbo` static-mock, Node compiler and setup compiler
  suites: **20/20**. The initial combined four-suite command also attempted two
  new lifecycle cases, but their installation failed before compilation; it is
  preserved as a failed command, not reported as 22/22 in one run.
- Corrected lifecycle suite alone: **2/2**, 11.071s. No unchanged 20-case rerun.

The original corpus verifies actual hoisted async partial factories and original
imports, nested mock dependencies, following-file isolation, package conditions,
TypeScript and JSX, configured loaders affecting both factory and stripped spec,
and empty namespace/original-side-effect suppression. Rejected graphs cover
captures/framework targets, direct/package cycles, raw/loader-injected client
boundaries and direct/alias-hidden queried targets. Rejections publish no artifact;
factory failures retain original source coordinates. Ordinary compiler/setup
coverage includes both real loader backends and serialized ownership closure.

Root dispatched B's additive 11-file lifecycle suite at SHA256
`74a2438abd32b0e93f542aa5f0896603fdc8405b20377caaa47901ec466e5377`.
Its explicit `vitest: 5.0.1` dependency was blocked by minimumReleaseAge during
isolated installation. Neither case executed in that first attempt. The reviewed
install-only correction SHA256
`8e2a2f7e1629807a40f340dc914e51d44fce82c5970177656c67ed4f865b62e9`
removes that unnecessary fixture package and test package option; normal harness
defaults and the compiler-owned Vitest facade are used. No release-age bypass,
runtime change, native rebuild or assertion relaxation was introduced.

Both corrected cases pass. Async factory collection rejection belongs to its
original run/file, collects no cases, then a fresh unmocked file sees original
values and fresh globals. The second case deliberately delays an actual graph
factory until terminal send, catches its dynamic import rejection, and verifies
a provisional passing payload still yields a final failed file/code 1 with the
late sentinel. The following original file passes without diagnostics. Distinct
actual worker PIDs are gone after each execution. This is a controlled internal
transport probe, not a claim about natural public scheduling order.

## Evidence and remaining gates

Prefix `/tmp/next-testing-L-stage2-mock-`:
`build-all.log`, `root-types.log`, `focused.log`, `actual.log` (20 pass plus two
pre-execution install failures), and `lifecycle-corrected.log` (2/2).
`native-loads.jsonl` records 28 loads across 24 processes for the original corpus;
`lifecycle-corrected-native.jsonl` records three more loads. Every record matches
d62. `full-manifest-comparison.json` records the exact 251-file comparison.
The only subsequent deviation is the reviewed fixture package deletion and
corresponding test import/option removal.

Immutable local Next/env/native/Playwright tarballs and hashes are retained under
`/tmp/next-testing-L-stage2-mock-frozen-package-v2/`. Its source manifest and native
provenance identify the exact package outputs supplied to P2. Initial package
freeze hit sandbox npm-cache EPERM; that evidence is retained under v1. A
separate task-local npm cache completed v2 without changing source/build outputs.
No consumer/runtime acceptance is inferred merely from packing.

This accepts the bounded internal development-Node static factory graph and
lifecycle checkpoint. Public capability activation, external mocked consumers,
expanded/public watch and final ordinary application regressions remain separate
pending gates. RSC/browser/production mocks, setup-plus-mock combinations and
unsupported target/binding forms remain rejected. Dependency evidence is output
hashes with `complete:false`, not proof of precise source invalidation. No L
build/watch/worker remains active; the slot was released to P2 for its consumer
checks. Earlier setup, snapshot and internal watch evidence remains immutable.
