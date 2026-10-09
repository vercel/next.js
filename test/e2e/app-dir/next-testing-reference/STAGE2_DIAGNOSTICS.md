# Independent static-mock diagnostic checkpoint

The three ordered patches in
`/tmp/next-testing-stage2-diagnostics-integrated-v1.json` were applied exactly:
A diagnostics `7d3dd0301273380dba75d381f6aed5fe264ba7f954a0f89c493e10953e8241f2`,
G graph guards `faef6e122bc3453141ef71131aacbc556f20d7c471c9cb0955a09069bf96c27a`,
and the strengthened fixture
`b0f73ff5b4bcf35103a886ce8b9009b3e5650a0da4953f8ff480b6be90435a8a`.
Forward/reverse application checks, all seven after-file hashes and all 21
native-input hashes matched. The previous d62 binary is preserved separately.

The installed native SHA256 is
`d4845161d653b0359a5b93663c546ffb603c37f792592f0f7e9c1d0fbfaab658`,
from `/tmp/next-testing-stage2-a2-native-diagnostics-v1-d4845161d653/`.
These changes classify known unsupported mock inputs as compiler issues; unrelated
engine and IO failures continue propagating. No JavaScript producer changes were
introduced by this increment.

## Independent checks

- Full `CI=1 pnpm build-all`: **18/18**, 35.258s. CI mode preserves the verified
  native build instead of invoking native auto-detection.
- Unchanged-root `pnpm typescript`: exit 0.
- Normal `pnpm test-dev-turbo` static-mock suite: **4/4**, 23.531s. This includes
  seven positive compiled cases and rejection cases for framework targets,
  captures, cycles, client boundaries, queries, nonliteral targets and setup
  combinations. The intentional factory failure retains original source frames.
  Expected compile errors must have no published artifact, and the strengthened
  fixture rejects internal-error and missing-telemetry output.
- Five native loads were audited against the exact d484 path/hash. All five
  recorded native-loading PIDs were gone after the suite.

Evidence prefix `/tmp/next-testing-L-stage2-diagnostics-`: `build-all-ci.log`,
`root-types.log`, `graph.log`, and `native.jsonl`.

The first plain sandbox bootstrap failed and is preserved in `build-all.log`.
Native auto-detection attempted partial-clone hydration with unavailable DNS,
then its fallback build failed to bind a local tsx socket (EPERM). The successful
retry used the established CI mode and permitted local listeners, without source
changes or an authentication workaround. The failed attempt is not a passing
build result.

## Frozen consumer artifacts

`/tmp/next-testing-L-stage2-diagnostics-frozen-package-v1/artifacts.json` records
immutable Next, env, native and Playwright archives. Unlike the earlier mock
package checkpoint, this Next archive includes the final public-watch and
capability changes. Every one of its 8,674 regular files was checked byte-for-byte
against the current built package. The native archive contains the exact d484
binary. `archive-verification.json` records this check; `source-manifest.json`
records producer source hashes and the dispatched diagnostic/native provenance.

Next tarball SHA256:
`63424dfd88ad7c18188458801d1f5283aae509b9a104135abf83c81c1f019e49`.
Native tarball SHA256:
`ee300e4d3057bf3dc459bd5338f29d532e8bb458d684dd869d8f94141f712400`.

The packages were handed to P and the shared build slot released after all L
commands completed. Fresh external-consumer public diagnostics and cleanup are a
separate pending P gate; this document does not count the owner's public CLI
checks as independent L proof or declare all of stage two accepted. Earlier d62
public-watch, expanded mutations, default application and production checkpoints
remain evidence for unchanged behavior and were not rerun for this bounded
native diagnostic increment.
