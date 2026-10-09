# Wave-three independent validation: blocked

Initial validation on 2026-09-16, atop accepted wave two.
Aggregate SHA-256: `43e1f0bf7751d24551a421f6f4f61ee5d6777ed9631bc0663311316686ddc8aa`.
The patch hash and apply check passed. The native artifact is unchanged from
wave two and its actual loaded path/hash were audited again.

Completed checks:

- Frozen install passed in 3.6s (+19/-2 packages).
- `pnpm --filter=next exec taskr ncc_next_test_primitives` passed in 1.34s.
- `pnpm --filter=next build` including declarations passed in 25.16s.
- D/C focused suites passed: 17/17 Jest tests, including their fresh-process
  assertion and lifecycle integration subcases.

The actual command **failed before collecting any tests**:

```sh
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  node --require /tmp/next-testing-L-native-audit.cjs \
  packages/next/dist/bin/next test \
  test/e2e/app-dir/next-testing-reference \
  --project reference-conformance --run
```

Result: exit 1, three failed files, zero cases collected. The project explicitly
selects the unchanged `unit.case.mjs`, `lifecycle.case.mjs`, and
`assertions.case.mjs` corpus in development RSC context.

Turbopack attempts to parse
`packages/next/dist/compiled/next-test-primitives/LICENSE` as JavaScript, reporting
an unterminated regular expression on its first line. The import trace is
`LICENSE` → compiled primitives `index.js` → assertions `index.js` → runner
`index.js`. No assertion API or emitted singleton acceptance is claimed.
Deliberate assertion-failure validation cannot yet reach the runtime.

Regenerating the bundle from the exact installed graph produced `822.index.js`
and changed `index.js`, while the reviewed artifact included `824.index.js`.
The generated files are preserved for owner diagnosis. The frozen graph itself
was not modified. D/A and the coordinator received the compiler failure.

Logs: `/tmp/next-testing-L-wave3-install.log`, `-primitives.log`, `-build.log`,
`-unit.log`, and `-cli.log`, all using the `/tmp/next-testing-L-wave3` prefix.
This report records the first failing gate; it does not replace wave-two evidence
or mark unexecuted conformance behavior as supported. Snapshot I/O remains
read-only. No watch process started for this wave remains running.

## Packaging correction: compiler gate cleared, hook scope still failing

Applied coordinator-reviewed D v4 packaging correction
`50d23e00eb6d383a375e5495a06199a881539f9d6660916d82a811b11ae328d6`.
The full patch conflicted with previously regenerated chunks, so the authorized
source-only application updated `taskfile.js` and `static-chunks.js`, then ran
the exact new task. Generated files byte-match reviewed v4 artifacts. Source
and dist both contain only `822.index.js`; no stale `824` remains. Previous
artifacts are preserved at `/tmp/next-testing-L-wave3-primitives-before-v4`.
The unchanged wave-two native binary remained active.

The primitive task passed (4.30s), followed by core build/types (50.23s).
The unchanged actual three-file command now reaches runtime:

- `assertions.case.mjs` passes promise resolves/rejects, spy calls/results and
  mock clearing with preserved implementation.
- `unit.case.mjs` passes assertions against the actual compiled subject.
- `lifecycle.case.mjs` correctly reaches a passing third retry, but the file
  fails in root `afterAll`: `expect() requires an active Next test attempt`.

The command exits 1: two files pass, one fails; three cases ultimately pass.
The report includes the two expected failed retry attempts and the hook error.
This is a runtime compatibility gap, separate from the now-fixed compiler gate.
C/D are correcting hook assertion scopes; the corpus was not weakened.

A separate temporary `expect(1).toBe(2)` case verifies a real matcher failure:
exit 1, one failed case, diagnostic `expected 1 to be 2`. Its file and temporary
configuration were restored in `finally`. Snapshot I/O remains read-only.

New logs: `/tmp/next-testing-L-wave3-v4-primitives.log`, `-build.log`, `-cli.log`,
and `-assertion-failure.log` under the `/tmp/next-testing-L-wave3-v4` prefix.
No identical conformance rerun is planned until the reviewed hook correction.
