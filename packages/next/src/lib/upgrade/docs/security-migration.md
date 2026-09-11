# Complete the approved Next.js security migration

Continue with the retained `context.json` after the repository preflight in
`security-upgrade.md` succeeds. Record progress, checks and the final outcome in
the same run directory’s `RESULT.md`.

## 2. Establish the baseline and run the codemod

Use an isolated branch or worktree when appropriate to protect the user's current
task. Compare the execution copy's installed Next.js version, relevant config and
manifest/lockfile SHA-256 hashes with the context baseline. If inputs changed,
resolve fresh context before migrating.

Identify checks supported by this app and record baseline failures before edits.
Preserve its intended behavior and optional feature configuration. Scope shared
workspace changes to required compatibility work and verify affected callers. Keep unrelated edits out of commits.

Run `tools.command` with `tools.args` as an argument array, with `app.directory`
(or the validated execution copy) as cwd. These arguments already select the exact
Next.js target, `--yes`, and `--skip-adoption`. Let the codemod select compatible
React dependencies through its normal upgrade flow.
Record stdout, stderr and exit status. The codemod may refresh its existing managed
agent rules; account for that documented behavior when inspecting the diff.

Keep the security target fixed when examples in the guides say `latest`.

## 3. Complete the migration using the guides

Build a migration checklist in `RESULT.md` from `docs.guides` before repairing
leftovers. Include every selected guide, including the codemod reference, then
read each guide and list its changes with their applicability to this app.
For a major upgrade, cover every crossed major; for a same-major upgrade, review
the target-major guide and applicable advisory/release notes. Follow relevant linked
references. If a read is truncated, continue through the remaining sections.

For each checklist item, record its source section, affected code/configuration,
and outcome: repaired with a check, verified not applicable with a reason, or
blocked. Keep unread guides and unreviewed sections open. Work through these items
alongside codemod findings; resolving the emitted markers closes only those findings.

The retained guides are independent of the application's `node_modules` and `.next`.
Use the upgraded package's bundled docs for target API details. If needed references
are missing, obtain canonical docs from the exact `vercel/next.js` release tag in a
fresh run subdirectory and record the resolved commit. Preserve corrected migration
guides supplied by the invoking CLI: an older target tag cannot contain later guide
fixes. Follow a guide's `source:` pointer when the copied page is only a router alias.
Missing essential documentation is a concrete blocker; do not assume a newer API.

Run a separately documented required codemod if version-based selection missed it.
For example, an app upgrading from Next.js 15 may still have synchronous Request
APIs even though the upgrade command no longer selects their earlier codemod. Use
the executable or package prefix recorded in `tools.command` and `tools.args`
for that transform, with its noninteractive option. This preserves the selected
codemod.

Resolve `@next-codemod-error` comments, `UnsafeUnwrapped*` casts, emitted migration
diagnostics and guide-required changes with no marker. For async Request APIs,
repair helper signatures and every affected caller; verify request-specific behavior.
A type cast or marker deletion is not a repair. Inspect the reason and choose the
appropriate documented solution rather than mechanically applying the first suggestion.

Keep adoption/optimization work outside this upgrade. The selected command uses
`--skip-adoption` to exclude feature-adoption transforms while running required
version migrations.

## 4. Verify and commit complete transitions

Reconcile the checklist against the final diff before committing. Every selected
guide must be reviewed and every item closed with evidence. Record the baseline
and final value for each configuration decision, including the actual bundler used
by the supported scripts.

Preserve the configured `experimental.agenticAutoUpgrade` policy. The invoking
upgrade CLI can be newer than the selected target, so the target may warn that
it does not recognize this experimental setting. Keep the policy and record the
warning as a compatibility limitation; removing it changes future upgrade behavior.

Use the app's supported checks and the guides' observable completion criteria.
Record each selected check's command, baseline result and post-upgrade result
together, and run the same checks after migration. A check that passed before the
upgrade and fails afterward is a regression that must be repaired before committing.
A changed framework default can explain that regression; it does not make it an
acceptable baseline limitation. If the required behavior cannot be restored, keep
the migration unfinished and report the blocker.

A build is appropriate when supported; a dev-only app needs meaningful dev/runtime
checks. Exercise behavior that can regress without a type error, such as per-request
cookies and caching. A clean codemod exit or build alone does not establish completion.

Close every finding with repair evidence. Replace an error directive with the
existing `@next-codemod-ignore` only when inspection and verification demonstrate
that the flagged code already satisfies the target contract; retain a reason.
A required unresolved repair keeps the attempt unfinished. Close retained log
findings in `RESULT.md` with evidence instead of deleting historical logs.

Create one complete commit per necessary version transition:

```text
Upgrade Next.js <source> to <target>

Why?
<Why this transition is required.>

How?
<Dependency changes, codemods, contextual repairs and verification evidence.>
```

Use the repository's commit/PR format when it specifies one. The commit body should
stand alone as a future PR description. Include version/lockfile changes and all
required repairs together; inspect the diff relative to the parent before committing.
A direct upgrade is one commit. Introduce intermediate versions only when required
by the migration; verify and commit each before proceeding. Preserve earlier complete
checkpoints if a later step fails. An intermediate vulnerable version is a migration
checkpoint, not completed security remediation.

## 5. Report or deliver

Confirm the final installed version equals the selected target and refresh the
reviewed Next.js advisory evidence, including all pages and excluding withdrawn
records. Use the recorded invoking CLI or retained tool installation to resolve
again if fresh evidence changes the target, then repair and reverify before delivery.
A package lacking the new command is not a reason to reuse stale security evidence.

When `context.dryRun` is true or this session requests local commits only, finish
after the verified commits exist. Update `RESULT.md` with the final outcome, including:

```text
Status: verified-local
Commits: <actual checkpoint SHAs and their messages>
Checks: <commands and observed outcomes>
Limitations: <baseline limitations and remaining warnings>
```

This completes a local-only session. Stop before push or PR creation. A pre-commit
report is not the final result; update it with the created checkpoints.
For authorized PR delivery, recheck for relevant open PRs immediately before publishing.
If another run already delivered one, report it and retain the local work without
opening another PR. This recheck reduces races but is not an atomic provider lock.

Publish one draft PR by default with the complete commits, the root/nested description
marker and accurate verification evidence. Use the actual remote and base, inspect
the returned PR's head/base/diff/marker, and report its real URL. If publication needs
new authority, report `verified-local` and that boundary. A clean harness exit never
proves publication. For any other unfinished outcome, record `blocked`, completed
checkpoints, remaining work and the concrete condition needed to resume.
