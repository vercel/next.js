# Watch selection

Source edits use compiler dependency evidence, with a full rerun when that
information is missing, incomplete or stale. The current emitted-output hashes
remain explicitly incomplete; filesystem notifications do not upgrade them.

Matching new test files have a separate registry policy, following the published
Vitest 5.0.4 `VitestWatcher.onFileCreate` implementation. A successful baseline
can run only newly registered entries when every observed path is exactly one of
the added test files, no entry was removed, effective configuration and profiles
are unchanged, and the existing entry, setup, serializer and configuration source
bytes still match their baseline. Unknown paths, source edits, mixed changes,
failed/cancelled baselines and unreadable or racing files retain the full rerun.
The result report includes every test that actually ran.

This registry policy does not promise that creating a test file cannot affect a
previously unresolved dynamic import or an `import.meta.glob` in another test.
The pinned runner also schedules the matching new file alone in those cases.
Its negative dynamic-import resolution cache can still fail collection of that
new file until a fresh process; matching scheduling does not establish parity
for that cache behavior.
It is an event policy, separate from complete source dependency tracking.
