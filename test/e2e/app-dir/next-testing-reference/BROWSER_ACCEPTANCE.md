# Browser acceptance specification

These cases require the exact coordinator-reviewed wave7 compiler aggregate,
wave8 parent browser orchestration, B11 emitted-import correction, and the
reviewed watcher-shutdown correction with its matching native compiler, and H6
browser-host signal ownership correction. Exact
source/native hashes and initial failing evidence belong in `WAVE8.md`. The
positive case is selected by `reference-browser`; negative cases remain excluded
and require temporary explicit selection. Execution evidence is recorded
separately from this acceptance specification.

Select one browser case file at a time through a temporary project configuration,
restoring the canonical configuration after each run. Record the aggregate and
native hashes, actual CLI command, exit status, report, and artifact paths.

- `conformance/browser.case.mjs`: expect two passing final cases across three
  attempts, including the intentional first retry failure. Check instant shell
  visibility before release, nested server content, Counter hydration, removal of
  the instant-testing cookie, and fresh cookies/local storage after each attempt.
  The previous page must be closed before the next attempt and before `afterAll`.
- `conformance/browser-failure.case.mjs`: expect one failed and one passing case,
  exit status 1, and the intentional failure diagnostic. The following case
  verifies the failed attempt's page closure and fresh browser state.
- `conformance/browser-cancel.case.mjs`: the independent host driver must wait for
  `L_BROWSER_READY_FOR_CANCEL`, then signal the CLI with SIGINT. Give the attempt
  enough timeout budget for this handshake. Check cancellation reporting, no
  execution of the following case, and retained cancellation artifacts.

For every acquired attempt, independently inspect the reported screenshot and
trace: files must exist after CLI exit, the PNG must decode, and the trace archive
must be readable. Verify attachment attribution to the original file, case, and
attempt, unique paths across retries, and attachment emission before that
attempt's terminal result. The positive run should produce three screenshots and
three traces. A failed retry's artifacts must remain associated with that retry.

For success, failure, and cancellation, verify that parent application-server and
browser-host processes terminate and that the output lock is released. Also
exercise a parent service-cleanup failure once the aggregate's injectable
validation path is known; its file status must fail even if all cases passed.
These host-level assertions cannot be established by the case callbacks alone.
