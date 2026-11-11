# Terminal reporting

The human reporter follows Vitest 5.0.1's default reporter: file and suite rows,
case visibility, status glyphs, deferred failures, assertion differences,
console labels, aligned totals, and watch status. The banner identifies the
Next.js version, and project badges identify the actual execution profile.

The reference is the published `vitest@5.0.1` default reporter, pinned to
[revision 0780a8e5](https://github.com/vitest-dev/vitest/tree/0780a8e5b7967a4168173599e9c74fb79aab2483/packages/vitest/src/node/reporters).
Select that reporter explicitly when comparing output: Vitest can select its
minimal reporter automatically inside an agent environment.

The reporter consumes structured events and owns no execution resources. Final
retry results determine each repeat's outcome, while each declaration is counted
once and fails if any repeat fails. All attempts remain in the event history.
Ignored stack frames remain in diagnostic evidence but are omitted from
terminal failures. Source excerpts come only from the retained compiled
revision's source maps, never from reading a potentially edited source file.
The separately bundled diff formatter does not initialize matcher globals.

Interactive terminals redraw active files, cases, totals, and elapsed time while
preserving permanent output. A shared display handles stdout, stderr, resizing,
and prompts, and restores the cursor when the run completes or is interrupted.
Piped output, CI, and dumb terminals keep append-only reporting.

Watch mode accepts Vitest-style commands: `h` for help, `a` or Enter for all tests,
`r` for the current pattern, `f` for failed files, `p` for a filename filter,
`t` for a test-name regular expression, `w` for project selection, and `u` for
one explicit snapshot update. Snapshot writes wait for successful generation
exit and cleanup. Ordinary command keys during a run cancel that run; idle `q`
exits with its last completed result, and Ctrl+C cancels and exits. Input raw mode
and listeners are restored on exit. Filter prompts accept text, backspace,
Enter, and cancellation.

Automatic agent-specific reporter selection is not implemented. Timings describe
the actual Next run; no Vite phase measurements are invented. Coverage and artifact
descriptions remain specific to the supported Next testing capabilities.

The existing reporting unit suite checks exact text, colors, stream routing,
retry evidence, and source attribution. The public CLI integration suites cover
plain and colored results, snapshot updates, lifecycle callbacks, and watch
reruns. Package verification reads structured events through a fixture-only
preload instead of parsing human terminal output.

## Machine reports and CI shards

`next test --reporter json --outputFile results.json` writes parser-friendly
one-shot results after authoritative cleanup. The standard result fields retain
all retry errors, including failed attempts of a passing test. `next.events`
retains every attempt, source-mapped diagnostic, attributed console output,
attachment, and snapshot summary. JUnit escapes XML content and includes file
and run errors even when no test body ran. Output errors fail the command.

Use `--reporter blob --outputFile shard-1.json` for each CI shard, then
`next test --merge-reports reports --reporter json --outputFile merged.json`.
This is a versioned Next-owned blob format, not Vitest's blob format. Merging
never starts compilation or execution. It rejects overlapping files, duplicate
run identities, unsupported versions, and incomplete evidence; paths from
separate checkout roots resolve in the merging checkout.
Nested run boundaries, duplicate completions, references to another shard's
files, and invalid result payloads are rejected before replacing output.

Standard JSON snapshot totals now use the pinned reference accumulation rules,
including statistics from obsolete-snapshot failures. The unchanged-body corpus
compares them with an isolated published 5.0.4 installation whose integrity is
checked and whose workspace has no Next patches. This does not establish every
report schema, failure interaction, or snapshot policy.

The conformance target is Vitest 5.0.4. Full JSON/JUnit schema parity, complete snapshot/report failure interactions,
empty-suite metadata, advanced watch/custom reporter adapters and editor/debugging
contracts remain unverified or missing. Human formatting's
historical 5.0.1 source attribution above is retained; it is not 5.0.4 terminal
conformance evidence.

JSON suite totals now consume authoritative runner completion events, preserving
empty suites and attributing nested hook failures independently of successful
cases. Todo suites count as pending; skipped suites follow the pinned reference's
suite counters. Each assertion includes the reference's empty benchmarks field.
Pristine 5.0.4 comparisons cover empty/skipped/todo suites, module collection
failure, nested cleanup failure and name-filtered selections. This is focused
schema evidence; complete JSON/JUnit/task metadata remains release work.
Next blob merging preserves the suite events and rejects invalid or duplicate
suite results, results after file completion, missing root completion and missing
suite ancestors before replacing an existing report. Earlier blobs without suite
events retain their existing fallback interpretation.

The final file result now agrees with retained repeat failures: a recovered retry
passes, while a failed earlier repeat keeps the file failed even if a later repeat
passes. Worker completion and snapshot authorization use that same rule. The
pristine 5.0.4 corpus reproduced the earlier passing-file/failed-case inconsistency
and compares the corrected file result as well as cases and CLI exit status.

Standard JSON assertion failures expand one AggregateError level and retain the
producer's saved stack heading, including asynchronous assertions whose stack
heading differs from their structured error name. Next events retain the complete
aggregate tree, original name, stack and mapped frames. The unchanged-body count
corpus covers soft matcher/count failures and awaited async mismatch failures.

Runtime skip completion carries `pending` and an optional note in Next events.
An explicit runtime skip replaces earlier failed retry/repeat outcomes in final
case/suite totals, and standard JSON clears failure messages as the reference
does. Original errors remain in the event history. Next blob merging rejects
malformed pending flags, non-skipped pending results and non-string notes before
output publication. Public context declarations cover unconditional/conditional
skip overloads with positive and negative type checks.


Task completion carries real `meta`, `tags` and retained annotations rather than
placeholder values. Standard JSON uses the latest metadata even when an earlier
failed repeat determines the final case outcome, and omits duration for static
skipped/todo selections as the pinned reference does. Source-mapped annotation
events preserve their attempt/revision ownership and are included in Next event
history; the human reporter displays their message/type and retained file links.

Next blobs validate annotation/attachment/location shapes and reject annotations
from an uncollected file, an unknown attempt or a completed attempt before output
publication. The reporting corpus round-trips annotation metadata and exercises
malformed payloads and forged ownership while preserving the prior report bytes.
This remains the Next blob format; pinned foreign final-task imports use the
separate adapter described below.


JUnit case classnames use project-relative source paths and names include their
ancestor suites, matching the pinned public reporter. Bail results have an
explicit unexecuted marker, separate from runtime skips and cancellation. Blob
merging rejects that marker after a case starts or completes, or with a retry,
repeat, duration or error payload inconsistent with an unexecuted declaration.


JSON assertion arrays traverse the retained declaration paths, including nested
numeric indices, rather than completion order. One-shot run starts retain the
selected specification IDs before CLI file sequencing and sharding; JSON file
arrays follow those specifications while excluding files not assigned to the run.
The Next event extension preserves actual execution order. Legacy events without
specification/declaration evidence retain their existing order. Watch's own run
boundary is not assigned a fabricated global file order; dependency-triggered
specification order remains a separate upstream timing-dependent behavior. Next
blob merges validate and retain each fragment's specification ordering evidence.

## Custom completion adapters

A JavaScript file selected with `--reporter ./reporter.mjs` can export a custom
reporter constructor with `onInit`, `onTestModuleEnd` and `onTestRunEnd`. Initialization finishes
before one-shot execution; completion receives retained final module, suite and
test views with real hierarchy, names, final outcomes, errors, test metadata and
annotations. Child collections support iteration and test/suite filtering.
An owned reporter process keeps constructors and callbacks outside compiler,
coordinator and test realms. Asynchronous completion and `context.onClose`
callbacks are awaited before releasing the reporter process. Publication or
cleanup failure fails the command while preserving the test results themselves.

Module completion callbacks consume the actual file-end result, after its tests
and cleanup finish. Their module and child test objects retain identity at run
completion. The development/production Node corpus checks passed, retried,
repeated, failed, skipped and todo cases, including failed retry errors on a
passing result. Rejected asynchronous module callbacks drain through later
files, run completion and close; the command fails while passing machine test
results stay intact. A fresh installed package matches the complete pinned
reference rows without a Vitest or Vite installation.

Other live hooks and collection/start specifications need actual additional
producer events and are rejected explicitly. Context currently
provides the real configured root and close registration; compiler/Vite/control
APIs are unavailable. Module/suite metadata, task diagnostics/logs/artifacts,
richer task history APIs and watch
lifecycle adapters remain release work. Unknown task APIs are not filled with
fabricated compiler timings or Vite objects. The standard Next result events and
machine reports retain their existing complete execution evidence.

Custom completion reporters can also be selected by package name, including
scoped packages and exported subpaths: `--reporter @scope/reporter/custom`.
Package entries resolve from the configured project root with Node's native
import conditions. JavaScript ES modules and CommonJS packages retain their
native dependency resolution and module identity. The same supported completion
hooks and close callbacks apply to file and package reporters.

File reporters can use `.ts` or `.mts` entries and their qualified relative
TypeScript import graphs. `.jsx` and `.tsx` file entries evaluate JSX using the
classic React transform and the reporter's own React import. Owned relative
JSX and TSX graphs support explicit and extensionless files, index files and
qualified JavaScript output suffix fallbacks, preserving native file precedence
and the pinned source suffix order. Other TypeScript profiles, package
configuration adapters, reporter options and watch lifecycle adapters still need
separate qualification. Package loading does not supply additional reporter hooks or
compiler control APIs.

## Importing pristine final-task blobs

`--merge-reports <directory> --reporter json` also accepts real published Vitest
5.0.4 flatted blobs, including files with the `.blob` extension. This is a separate
final-state projection: it validates the foreign task ownership graph and
preserves structural names, final statuses/timings, metadata and errors. A passing
retry can retain failed retry errors, and unhandled errors fail the merge command
without changing passing case results or the pinned JSON success calculation.

The unchanged six-case runtime-skip corpus also retains complete pinned merge
JSON, including skips after failed retry/repeat attempts, static skip/todo
controls and metadata assigned before a runtime skip. These are terminal foreign
tasks; nonterminal collected-task imports remain unqualified.

Imported results have a `vitest` provenance extension containing each source
name, digest, execution time and original flatted table. They do not contain
fabricated Next run/attempt/compiler events. Upstream blobs do not serialize the
original run boundaries, individual attempt history or snapshot summary; the
standard snapshot fields match a fresh pinned merge context, and the extension
states which evidence is unavailable. Foreign environment graphs remain opaque
data and never restore or start a Vite controller. Original producer paths remain
foreign source identities and are never opened or rebased from a guessed root.

Validation and serialization finish before report replacement. Mixed Next and
foreign inputs, duplicate logical specifications, ambiguous native task IDs,
malformed references/ownership/paths, nonterminal tasks and oversized data are
rejected. Static skipped/todo tasks may
legitimately lack results; pending imports, foreign coverage, other output
reporters and custom callbacks still need separate adapters. The strict Next
blob validator and complete Next attempt/event evidence remain separate.

## Unhandled process rejections

The file worker reports real unhandled rejections through its file failure sink
through cleanup and terminal IPC. Completed case results stay intact and later
cases can finish, while the file/command fails and staged snapshots cannot be
published. Primitive rejection reasons retain their serialized value.

Next events mark this process-origin evidence separately from task errors. The
pinned JSON task projection can therefore report success and passing cases when
only an unhandled rejection fails the command. Case, hook, cleanup, run-level and
cancellation failures retain their failure states; the JSON projection cannot
authorize snapshot writes or override the command outcome.
