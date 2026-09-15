# Next.js upgrade evals

This suite extends the existing `@vercel/agent-eval` setup. Fixtures use exact old
Next.js versions, while the separately packed candidate provides the global
`next upgrade` command.

## Run

Use the existing [eval credential setup](../README.md#one-time-setup): `vc link`
and `vc env pull` at the repo root. Both runners share environment-file linking
and package packing. Authentication, sandbox selection, native agents, withheld
assertions, judging and result storage belong to `@vercel/agent-eval`.

```sh
pnpm build-all
pnpm eval:upgrade <fixture-name> --dry
NEXT_UPGRADE_EVAL_EXPERIMENT=codex pnpm eval:upgrade <fixture-name>
```

Omit the experiment filter to run Codex and Claude. `--list` lists fixtures without
packing or making model calls. Run one named fixture at a time. Results use the
framework's normal `results/` layout. Fixtures are added by the feature PRs stacked
above this infrastructure.

## Lifecycle

1. Upload candidate Next.js and codemod packages without changing the app.
2. Install candidate Next.js separately and expose its CLI as the global `next`.
3. Let agent-eval install the app and agents with its normal npm lifecycle.
4. Run the native agent and judge. Agent-eval withholds `EVAL.ts` and captures
   transcripts and results as usual.

Package archives use the same fixed, overwritten paths as existing evals. Invalid
fixtures fail before execution, and infrastructure failures remain in the results.
No new dependency or private agent-eval import is required.

## Adding feature coverage

Feature PRs add ordinary npm app fixtures with exact dependency versions,
`PROMPT.md`, and `EVAL.ts`. Prompts invoke `next upgrade` directly. Feature PRs own
browser setup, repository remotes, advisory responses, codemod routing, grading,
and reference or negative controls. Keep graders and reference solutions withheld,
and retain sandbox or authentication failures as failures.
