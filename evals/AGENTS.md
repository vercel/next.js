# Eval publication

Treat `eval.config.json` as the source of truth for whether an eval may be
exported to `next-evals-oss` or published on nextjs.org/evals.

- Do not export fixtures whose config sets `publish` to `false`.
- Do not publish transcripts or scores from those fixtures.
- Keep local-skill evals private until the skill is released and the eval owner
  explicitly removes the restriction.
- Keep agent-feedback and privacy evals private. Their prompts test reporting
  policy, anonymization, and unpublished workflow details that should not become
  public benchmark material.

The fixture source can still live in this repository. `publish: false` controls
downstream benchmark publication, not whether the fixture is committed here.
