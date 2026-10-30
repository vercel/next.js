# Agent Build tasks

Agent Build tasks measure whether agents can make correct Next.js changes and help assess framework guidance, agent effort, and model capability. Each task is a directory here in the [Harbor task format](https://docs.harborframework.com/tasks/overview), with a separate, offline verifier that checks behavior. Review the patch and transcript alongside the score to assess guidance, verification, and work still needed from a human.

They are the newer of the two kinds of evals in this repository. The older `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites with their published history, and [evals/README.md](../README.md) describes them. Agent Build tasks never join those suites or their labels.

| Read                         | When you                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| [Create a task](./CREATE.md) | Define a task, choose its checks, review runs, and open its pull request |
| [Harbor format](./HARBOR.md) | Need the task layout, the Harbor references, and what our tasks add      |
| [Run tasks](./RUN.md)        | Install Harbor, validate a task, calibrate models, and read transcripts  |

## Task authoring and runs

This directory owns task definitions, verifiers, and authoring guidance. Task PRs include validation summaries and links to supporting runs, without committing raw transcripts or job directories alongside the tasks.

Shared runs and their evidence belong in [`vercel/next-evals-oss`](https://github.com/vercel/next-evals-oss): scores, transcripts, patches, and verifier output tied to the task revision. These Harbor tasks currently use the local pilot adapters in `tools/`; connecting them to that pipeline is separate work. The later shared Vercel eval layer can replace the execution setup without redefining the tasks.

Keeping run output out of a task PR is a repository boundary, not a requirement to keep it private. The pilot task sources are public. Publishing scores on nextjs.org/evals remains a separate decision.
