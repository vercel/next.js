# Agent Build tasks

Agent Build tasks measure whether agents can make correct Next.js changes and help assess framework guidance, agent effort, and model capability. Each task is a directory here in the [Harbor task format](https://docs.harborframework.com/tasks/overview), with a separate, offline verifier that checks behavior. Review the patch and transcript alongside the score to assess guidance, verification, and work still needed from a human.

They are the newer of the two kinds of evals in this repository. The older `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites with their published history, and [evals/README.md](../README.md) describes them. Agent Build tasks never join those suites or their labels.

| Read                         | When you                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| [Create a task](./CREATE.md) | Define a task, choose its checks, review runs, and open its pull request |
| [Harbor format](./HARBOR.md) | Need the task layout, the Harbor references, and what our tasks add      |
| [Run tasks](./RUN.md)        | Install Harbor, validate a task, calibrate models, and read transcripts  |

This directory owns the Next.js task definitions and grading contracts. The scripts in `tools/` are temporary pilot adapters for validating and calibrating these first tasks. Shared execution, credentials, budgets, evidence, and reporting belong in the Vercel-owned eval layer built from Vercel Bench and Harbor. Landing a task here does not establish that platform contract or promise that the task moves there unchanged.
