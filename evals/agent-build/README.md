# Agent Build tasks

Agent Build tasks test whether agents can make correct Next.js changes. Use them to compare framework guidance, agent effort, or model capability. Each task uses the [Harbor task format](https://docs.harborframework.com/tasks/overview), with a separate, offline verifier that checks behavior.

They are the newer of the two kinds of evals in this repository. The older `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites with their published history, and [evals/README.md](../README.md) describes them. Agent Build tasks never join those suites or their labels.

| Read                         | When you                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| [Create a task](./CREATE.md) | Define a task, choose its checks, review runs, and open its pull request |
| [Harbor format](./HARBOR.md) | Need the task layout, the Harbor references, and what our tasks add      |
| [Run tasks](./RUN.md)        | Install Harbor, validate a task, calibrate models, and read transcripts  |

## Task authoring and runs

Author task definitions and verifiers in this directory. Keep scores, transcripts, patches, and verifier output together as run evidence, tied to the task revision. Task PRs include a validation summary and links to that evidence; raw job directories stay outside the task source.

The scripts in `tools/` support local validation and calibration. Shared execution and result storage for these tasks are planned in [`vercel/next-evals-oss`](https://github.com/vercel/next-evals-oss). Publishing scores on nextjs.org/evals is separate from adding a task.
