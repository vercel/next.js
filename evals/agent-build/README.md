# Agent Build tasks

Agent Build tasks measure whether an agent can make a correct Next.js change to a working app, on work that still separates models. Each task is a directory here in the [Harbor task format](https://docs.harborframework.com/tasks/overview), graded by a separate, offline verifier that checks behavior.

They are the newer of the two kinds of evals in this repository. The older `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites with their published history, and [evals/README.md](../README.md) describes them. Agent Build tasks never join those suites or their labels.

| Read                         | When you                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| [Create a task](./CREATE.md) | Find, draft, screen, grade, and calibrate a task, and open its pull request                  |
| [Harbor format](./HARBOR.md) | Need the task layout, the Harbor and Terminal-Bench rules it follows, and what our tasks add |
| [Run tasks](./RUN.md)        | Install Harbor, validate a task, calibrate models, and read transcripts                      |

This directory owns the Next.js task definitions and grading contracts. The scripts in `tools/` are temporary pilot adapters for validating and calibrating these first tasks. Shared execution, credentials, budgets, evidence, and reporting belong in the Vercel-owned eval layer built from Vercel Bench and Harbor. Landing a task here does not establish that platform contract or promise that the task moves there unchanged.
