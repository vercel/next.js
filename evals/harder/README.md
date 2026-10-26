# Harder eval workflow

Harder evals measure realistic Next.js work that produces meaningful capability
differences between models. They complement the existing documentation and
regression evals under `evals/`.

## Select a candidate

Start from an observed problem, such as repeated agent feedback, a framework or
documentation gap, or a real repository change. Partner samples such as
Dari/SelfBench tasks can also provide candidates.

A source does not qualify a task by itself. Keep a candidate only when it has a
realistic request, a reproducible starting state, and checks that measure the
requested behavior.

## Use the Harbor task format

The harder-eval pilot uses
[Harbor](https://github.com/harbor-framework/harbor), an open-source framework
for packaging and running agent tasks. Each Harbor task contains the
instruction, pinned environment, reference solution, tests, and verifier:

```text
tasks/<name>/
├── task.toml
├── instruction.md
├── environment/
├── solution/
└── tests/
```

Harbor is the current execution format, not the suite's identity. Keep task
selection, calibration, and publication decisions independent from the runner
so the workflow remains valid if the execution system changes.

## Review and calibrate the task

1. Review the instruction and source revision. Confirm that the task describes
   realistic work and that the environment reproduces its starting state.
2. Review the reference solution, tests, and verifier. Grade behavior instead
   of matching the reference patch, and keep verifier-only material out of the
   agent environment.
3. Run one valid attempt for each model in the fixed frontier and weaker-model
   cohort. Record the runner, agent version, model identifier, task version,
   source revision, and any changes made to the supplied task.
4. Discard and retry infrastructure failures. For model failures, inspect the
   trajectory and verifier output before treating the result as evidence.
5. Record a `keep`, `fix`, or `drop` decision with the calibration results and
   reasoning. `keep` admits the task to the maintained harder suite, `fix`
   returns it for another review, and `drop` removes it from consideration.

## Decide publication separately

Harder evals remain unpublished until the team assigns each task a public,
private, or held-out status. Do not add candidates to the nextjs.org/evals
export or expose held-out verifier material during calibration.
