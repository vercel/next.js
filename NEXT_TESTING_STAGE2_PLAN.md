# Next testing: stage two

Stage two is accepted. Seven fresh GPT-6 Astra implementation tasks, using medium reasoning, delivered compiled setup, the supported Vitest authoring APIs, explicit snapshot updates, static Node module mocks, Node/RSC watch and external package adoption. Independent checks cover the combined compiler/runtime, failure and cancellation paths, ordinary application regressions and the final packed consumer.

Build on the independently accepted first milestone recorded in `test/e2e/app-dir/next-testing-reference/WAVE9.md`. The next milestone makes the runner useful for ordinary test authoring and repeated local development. Next continues to own compilation and execution; Vitest supplies the compatibility contract.

Start fresh implementation tasks from one frozen, validated source snapshot. Retain L's independent validation task and built integration worktree. Each implementor uses GPT-6 Astra with medium reasoning. The coordinator integrates reviewed changes and owns acceptance.

## Parallel assignments

| Task                           | Responsibility                                                                                                                                                               | Result to hand off                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I2: Contracts and CLI          | Own shared interfaces, capability declarations, configuration and CLI integration. Coordinate the boundaries needed by other tasks before they diverge.                      | One coherent command/configuration surface with explicit supported and unsupported behavior.                                                             |
| A2: Compiler integration       | Extend the real Next compiler for ordered setup modules, static factory mocking, and dependency/change information. Own shared native entry points and compiler integration. | Reusable compiled artifacts and real graph evidence consumed by the other tasks.                                                                         |
| B2: Execution and setup        | Execute compiled setup modules in the correct file context before the spec. Integrate file-scoped mock resources and preserve cleanup, cancellation and isolation.           | Setup and execution work through the actual worker, including failure and teardown cases.                                                                |
| C2: Test API compatibility     | Expand declarations, hooks, fixtures and assertion utilities against a pinned Vitest reference. Own the authoring facade and safe snapshot-update semantics.                 | A precise compatibility inventory with conformance checks; snapshot writes are enabled only for explicitly requested, correctly scoped runs.             |
| G2: Module mocking             | Implement the first static factory-mock capability through the compiler and runtime boundaries. Own mock-specific modules and coordinate shared native changes with A2.      | Real compiled tests demonstrate ordering, original imports, async factories, target identity and file isolation. Unsupported mock forms fail explicitly. |
| J2: Watch and incremental runs | Implement the watch session and affected-test scheduling using compiler evidence. Own repeated-run lifecycle and conservative invalidation.                                  | Changes trigger correct fresh executions; uncertain dependencies rerun all relevant tests. Results agree with full runs.                                 |
| P2: Packaging and authoring    | Make the supported subset installable and type-correct outside the monorepo. Own package/export wiring and a small external-consumer verification fixture.                   | A locally packed installation can author and execute the supported Node, RSC and browser examples without repository-only imports.                       |
| L: Independent acceptance      | Extend the existing reference corpus and test each combined increment against actual Next and the pinned Vitest contract.                                                    | Reproducible acceptance evidence for the stage, including ordinary application regressions.                                                              |

## Integration order

1. I2 and the producers agree the minimum shared contracts. A2 delivers compiled setup loading first so B2 and C2 can establish the authoring lifecycle. Other tasks develop their owned modules and acceptance cases in parallel.
2. Integrate setup and compatibility increments as soon as their actual compiler/runtime paths work. G2 and A2 then connect the static factory-mock bridge; C2 exposes only the verified capability.
3. Connect J2's watch session to real compiler change information and I2's command surface. Preserve the established compiler/application-server output handoff and immutable execution artifacts.
4. P2 verifies local package installation and authoring throughout integration. L accepts each working capability and finally reruns the combined milestone. Documentation follows observed behavior.

Use dependency gates, not a requirement that every task finish together. Keep compiler-native builds coordinated through A2 and independent combined builds through L. Small, focused checks belong to each implementor; avoid launching duplicate broad builds.

## Stage acceptance

- Compiled setup files run in declared order, share the intended runner context, and remain isolated between test files. Setup failures produce useful results and complete cleanup.
- Supported factory mocks affect the actual compiled dependency graph before subject evaluation. Original imports, async factories, failure handling and a second unmocked file behave correctly. Framework and unsupported target boundaries stay explicit.
- Advertised API behavior matches the pinned compatibility corpus. Snapshot updates preserve unrelated, skipped and filtered tests and never occur implicitly.
- Watch runs respond correctly to source, setup, configuration and test discovery changes. Rapid changes, failures and cancellation do not lose work or retain previous execution state. Narrow selection requires trustworthy compiler evidence; otherwise selection is conservative.
- A locally packed installation resolves the advertised imports and types and executes the supported examples using Next's compiler/runtime.
- The accepted unit/RSC/browser path, loader cleanup and ordinary production behavior continue to pass independent checks.

Production test-entry profiles, browser component mounting, coverage, editor integrations and broader platform support remain subsequent increments. Stage two does not claim the entire Vitest API or ecosystem.

## Accepted handoff

The [task directory](NEXT_TESTING_STAGE2_TASKS.json) records every workstream as accepted. The [coordination record](NEXT_TESTING_WORKSTREAMS.json) preserves exact source inputs, native provenance, earlier failures and their verified corrections.

The canonical reference fixture records [setup](test/e2e/app-dir/next-testing-reference/STAGE2_SETUP.md), [authoring and packages](test/e2e/app-dir/next-testing-reference/STAGE2_AUTHORING.md), [snapshot updates](test/e2e/app-dir/next-testing-reference/STAGE2_UPDATE_CLI.md), [static mocks](test/e2e/app-dir/next-testing-reference/STAGE2_MOCK_INTERNAL.md), [public watch and ordinary regressions](test/e2e/app-dir/next-testing-reference/STAGE2_PUBLIC_WATCH.md), [watch mutation and cancellation](test/e2e/app-dir/next-testing-reference/STAGE2_WATCH_MUTATIONS.md), [final compiler diagnostics](test/e2e/app-dir/next-testing-reference/STAGE2_DIAGNOSTICS.md), and [final external package acceptance](test/e2e/app-dir/next-testing-reference/STAGE2_PACKED_DIAGNOSTIC_ACCEPTANCE.md).

The next stage can start from the combined accepted source snapshot referenced in the coordination record. Retain the capability boundaries above; this milestone does not imply full Vitest or cross-platform compatibility.

## Ownership and handoff rules

I2 owns shared contracts, configuration and orchestration files. A2 owns existing shared native/compiler files and test templates. B2 owns execution resources; C2 owns runner/assertion code and the Vitest facade; G2 owns mocking modules; J2 owns incremental/watch modules; P2 owns package/export wiring; L owns the canonical reference fixture. Agree narrow changes to another owner's files before editing them.

Every handoff includes an exact patch against the frozen baseline, required dependency patches, checks actually run, remaining limits and downstream consumers. Native changes include immutable binary/source provenance. No task substitutes another compiler or runtime to pass its tests. The coordinator reviews and integrates; L verifies the real combined system.
