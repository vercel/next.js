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

1. Create one temporary Vercel Sandbox snapshot with the agent CLIs.
2. Upload the fixture and establish its git baseline.
3. Install candidate Next.js and codemod packages separately, route npm and npx
   upgrade commands to the candidate CLI, then install app dependencies.
4. Snapshot the prepared fixture and fork each selected agent from it.
5. Run each native agent and judge independently. Agent-eval withholds `EVAL.ts`
   and captures transcripts and results as usual.

Package archives use the same fixed, overwritten paths as existing evals. Invalid
fixtures fail before execution, and infrastructure failures are retained in the results.

## Adding feature coverage

Feature PRs add ordinary npm app fixtures with exact dependency versions,
`PROMPT.md`, and `EVAL.ts`. Explicit upgrade scenarios invoke
`npx next@canary upgrade --ai`. Reminder scenarios keep the original task prompt
unchanged so the eval can attribute acknowledgment to the runtime notice. Feature
PRs own browser setup, repository remotes, advisory responses, codemod routing,
grading, and reference or negative controls. Keep graders and reference solutions
withheld, and retain sandbox or authentication failures as failures.
