# Independent expanded watch mutation checkpoint

This adds mutation evidence to STAGE2_PUBLIC_WATCH.md and supersedes its pending
expanded-mutation item. Both independently executed profiles passed on native
`d62aeb2983c6d90c5527a63a3b9b7a0d6313f2181515ca6f78b818d770017fc6`,
with the same reviewed source and 21 native inputs as that checkpoint. No
implementation changes or rebuilds occurred between those checks and these probes.

## Actual Node and RSC coverage

Each profile completed all 11 semantic stages: initial pass, imported source
change, spec change, spec addition, spec removal, assertion failure, assertion
recovery, missing-dependency compilation failure, dependency creation recovery,
rapid edits during a running case, and latest-value success with fresh setup.
The RSC spec imports `server-only`. These probes invoke internal `watchTests`;
public CLI behavior is separately established in STAGE2_PUBLIC_WATCH.md.

The held case has a 45-second timeout. The driver requires an explicit CANCELLED
terminal, rejects FAILED, requires the prior file and compiler PIDs to be gone
before the next generation begins, and bounds that transition to less than ten
seconds. Thus eventual success after timing out the old case cannot satisfy this
check. Intermediate edits are followed by a final source/spec/setup combination
whose expected value passes. Final watch shutdown is cooperative cancellation.

Both runs exited successfully. Each recorded 11 exact d62 native loads and 35
process owners; none remained after completion. The supervisor required no forced
cleanup in either run. The original configuration was restored, the temporary
fixture removed, and no new test artifacts remained. Process coverage is limited
to recorded spawn/fork, native and file owners; it does not establish coverage of
unrecorded descendants or general source-graph precision.

## Reviewed driver and evidence

The reviewed driver is `/tmp/next-testing-L-stage2-watch-mutations-v2.cjs`.
Its companion `/tmp/next-testing-L-stage2-watch-supervisor-v2.py` bounds execution
and reclaims recorded process groups and PIDs on success or failure, retaining the
original failure and failing otherwise-successful runs that need forced cleanup.
The spawn observer is `/tmp/next-testing-L-stage2-watch-spawn-audit.cjs`.
Their SHA256 values are frozen in
`/tmp/next-testing-L-stage2-watch-mutation-driver-hashes.json`.

For each of `node` and `rsc`, evidence is:

- `/tmp/next-testing-L-stage2-watch-<environment>-mutations-v2.result.json`:
  semantic stages, held-generation assertions, native count and artifact baseline.
- `/tmp/next-testing-L-stage2-final-watch-<environment>-v2.log` and `.driver.log`:
  complete run and raw driver output.
- The same final prefix with `.native.jsonl`, `.spawn.jsonl`, and
  `.supervisor.json`: exact native loads, recorded process ownership and cleanup.

The first Node driver run remains diagnostic only. It reached latest success but
failed its final artifact assertion against a directory predating that run:
`.next-test-55bc05bf-0aea-4148-9f68-e9c98f2e3bd9`, timestamp 15:46:44 on
2026-09-16, versus the probe at 19:30. Its log remains at
`/tmp/next-testing-L-stage2-final-watch-node-mutations.log`. The revised driver
preserves that baseline directory, checks for new retained artifacts, and adds
strict cancellation ordering and bounded failure cleanup. No acceptance is
inferred from the original run.

## Remaining gate

This accepts the bounded expanded-watch probes, not all of stage two. Expected
unsupported static-mock errors in external package checks still need the owner's
native diagnostic fix and exact-pair verification: fatal/missing-telemetry output
is not an acceptable user diagnostic. Existing public-watch, default application,
production and positive package/type checkpoints remain separately recorded.
