# Wave-seven independent validation

Validated on 2026-09-16, directly after accepted wave six plus E13/C6.
Aggregate SHA-256:
`5d06f04a966849ffa471aea2fa5cfc7b9e5ad6dd3cc90e281e8025a22caaea6b`.
The hash and apply check passed. All ten Rust source hashes match the immutable
native provenance at `/tmp/next-testing-a-native-v9-75f662135924/provenance.json`.
Native SHA-256:
`75f662135924db664e0eed751265770d529fcf699d4ea1cd386d0821854c4d0e`.
The previous `495503` native is preserved locally. Actual canonical CLI commands
use a preload that verifies both the native realpath and SHA at `process.dlopen`.
No workspace dependency installation was needed; normal-mode test harnesses
prepare their own isolated application installations.

| Check                                                       | Result                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| Core build and package types                                | Passed; build 28.91s                                        |
| Six affected compiler/execution/CLI/browser-resource suites | 109/109 passed, 10.475s                                     |
| Normal dev-mode native compiler corpus                      | 9/9 passed, 36.643s                                         |
| Actual Node CLI unchanged compatibility corpus              | 3 files / 3 final cases passed, exit 0                      |
| Actual RSC render under artifact v2                         | 3/3 passed, exit 0                                          |
| Normal managed application-server oracle                    | 2/2 passed, 34.317s                                         |
| Closed render at terminal IPC                               | Expected exit 1/file failure, completed case remains passed |

`reference-node` selects the exact existing unit, lifecycle, and assertion files.
No case expectations changed. The lifecycle case still fails its first two
attempts, succeeds on the third, and validates cleanup in root `afterAll`.
The reporter retains the two expected retry diagnostics with a passing final run.

The normal compiler suite checks actual Node conditions and transforms without
an app directory, Node `server-only` poison, external mutable-link rejection,
RSC conditions and `client-only` poison, browser-driver application-lock evidence,
missing-facade fail-closed behavior, and packaged-helper `vitest` aliases in both
Node and RSC. Browser-driver publication is not full browser CLI execution.

The RSC corpus retains normalized nested server text and exact manifest-derived
Counter boundary identity, concurrent/repeated cookie isolation, file cache and
`after()` drain behavior, and precise nonserializable client-prop rejection.
The instrumented terminal IPC regression still preserves the original closed
render scope diagnostic: the forwarded terminal payload is passing, the worker
then exits 1, and the parent fails the file without revising the passed case.
Neither render options nor component code is accessed after scope closure.

Commands and logs use the `/tmp/next-testing-L-wave7-` prefix:
`build.log`, `types.log`, `unit.log`, `compiler-dev.log`, `node-cli.log`,
`render-cli.log`, and `render-disposal-after.log`. The canonical CLI command is:

```sh
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
node --require /tmp/next-testing-L-native-audit-wave7.cjs \
  packages/next/dist/bin/next test \
  test/e2e/app-dir/next-testing-reference --project reference-node --run
```

Use `reference-render` for the RSC corpus. The negative regression's temporary
configuration is restored in `finally`. Browser cases remain unselected until
the separately reviewed parent orchestration batch. Production test entries and
normal-production omission of testing transport are not established here.

The normal managed-server oracle starts the real Next process, checks instant
shell/release and Counter hydration, retains screenshot/trace attachments, and
verifies process termination. Its second case rejects an output directory owned
by another dev server while leaving that external server healthy. Log:
`/tmp/next-testing-L-wave7-server-dev.log`. This is independent server-resource
evidence; the framework harness prepares the app and it is not a browser CLI run.
