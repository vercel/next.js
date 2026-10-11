# Independent final packed-consumer evidence acceptance

This closes the pending external-consumer diagnostic/cleanup gate in
STAGE2_DIAGNOSTICS.md. L performed a read-only independent audit of P's completed
fresh-consumer run; L did not rerun that suite or rebuild the packages. The saved
evidence is `/tmp/next-testing-stage2-p2-final-diagnostics-v1/`. The independent
audit script and result are `/tmp/next-testing-L-stage2-final-package-audit.py`
and `/tmp/next-testing-L-stage2-final-package-audit.json`.

## Exact provenance

All four copied archive hashes match L's immutable final archives. All 8,674
installed Next regular files match the Next archive byte-for-byte, including
public declarations. All 9,306 recorded producer source hashes match the root
checkout. All 21 native source hashes and the installed d484 binary match the
reviewed diagnostic build. The six actual native audit records resolve inside
the external consumer, with that exact binary hash. No declaration overlay is
present in the installed package.

The root's 13 verifier/fixture files match both the runtime source record and
`/tmp/next-testing-stage2-p2-final-integrated-v1.json`. Both ordered fixture patch
hashes match: b044 base and cumulative fc96 correction. No previous verifier
correction is layered over the final one.

## Saved actual runtime and types

All six public CLI invocations have the expected status and passing-case count:

- Positive command: four passing JS/TS mocked and following unmocked cases,
  establishing same-command file isolation.
- Factory failure: exit 1, collection diagnostic, no case-body execution;
  original factory line 6, column 9 is retained. The displayed frame still
  contains a virtual Turbopack prefix; normalized paths are not claimed.
- Setup combination, RSC scope and nonliteral target: each exits 1, with its
  exact expected message inside an ERROR compilation block and no case execution.
- After-failures command: the unmocked JS case passes.

All six full saved outputs were checked for secondary fatal, internal Turbopack,
missing telemetry, panic and infrastructure failure text; none was present.
Unexpected-body/setup sentinel files are absent. Saved per-process stdout/stderr
also match the corresponding combined command logs.

Both strict public type checks passed, using bundler and Node16 resolution. The
actual compiler input records include all eight expected JS/TS files and the
installed public declaration. Strict mode, allowJs and checkJs are enabled;
skipLibCheck is false. Type evidence is separate from actual runtime execution.

## Ownership and acceptance boundary

All six command results have complete audited startup/spawn ownership, no pending
registrations, no missing startup records, no detected live workers and no cleanup
failures. L checked all 12 recorded process PIDs again: each was gone. Parent-side
spawn records reconcile with child startup identities for every actual child.

L also inspected the three saved supervisor failure controls: hanging CLI,
successful CLI with a leaked detached worker, and immediate parent exit before
worker startup audit. The last control records the child at the parent's spawn
boundary even though the child has no startup record. Each control remains a
rejected completion, detects the worker and reclaims its processes; all six
control PIDs were gone. These are verifier controls, not additional successful
Next runtime tests. Coverage remains limited to recorded owned Node workers and
their groups, not arbitrary processes escaping the audit or supervisor SIGKILL.

The original fatal/missing-telemetry package logs remain historical failed
evidence. This clean run supersedes only that pending diagnostic/cleanup gate.
The earlier bounded d62 watch/default/production checkpoints remain unchanged;
this addendum does not extend support to browser watch, watch snapshot updates,
production test profiles, general source-graph precision or unimplemented mock
forms. No source, package or broad test rerun was needed for this evidence audit.
