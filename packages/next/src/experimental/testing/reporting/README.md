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
