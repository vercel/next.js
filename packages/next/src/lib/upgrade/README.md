# Human upgrade reminders

Interactive `next dev` and `next build` invocations offer security upgrades when
`experimental.agenticAutoUpgrade` is enabled. CI, coding agents, and non-TTY
invocations skip the human path before metadata or preference access.

The dev parent owns the terminal and prompts after server readiness. The server
keeps serving until Update now is selected. Build prompts only after a successful
build and cleanup. Programmatic builds do not present a menu.

- Update now stops the dev worker and launches the existing upgrade CLI with the
  configured policy. The command exits with the upgrade's status; it does not
  automatically restart dev or rebuild. Cancelling the harness picker leaves dev
  stopped.
- Skip and Escape dismiss the reminder for the current invocation, including dev
  worker restarts. Ctrl+C cancels the command normally.
- Skip until next version stores the installed version and policy per reminder
  kind. Dev and build share the preference. Git worktrees share it for the same
  repo-relative app; separate apps have separate preferences. This also suppresses
  newly published advisories until the installed version or policy changes.

Preferences use Next.js' global config location independently of telemetry
consent. Metadata and preference failures never fail the original command.
