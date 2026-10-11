# Next.js testing: implementation handoff plan

Implement the agreed [architecture](/Users/timneutkens/.codex/worktrees/dd75/next.js-2/NEXT_TESTING_PLAN.md) through independently owned workstreams, connected by shared contracts and verified through working end-to-end milestones. This document defines approach, ownership, dependencies, and completion criteria; implementation choices belong to the assigned agents.

**Fixed direction**

- Next.js owns compilation, test execution, runtime, isolation, rendering, and mocking.
- Tests reuse Next.js's actual Turbopack configuration and application environments.
- Vitest test-authoring APIs are the compatibility contract. Reusable libraries are allowed within the Next-owned runtime.
- RSC tests use real rendering. Browser integration and e2e tests use real browsers, with Playwright automation and the existing `instant()` helper.
- Compilation reuse and execution isolation are separate concerns. Development and production fidelity are verified separately.

**1. Establish the shared foundation**

Assign one integration lead before distributing implementation. The lead owns shared contracts, cross-team decisions, integration order, and milestone acceptance.

Agree on the boundaries between compilation, execution, test APIs, rendering, browser fixtures, and results. Define what each team provides and consumes, who owns lifecycle and cleanup, and how failures cross those boundaries. Establish an initial Vitest compatibility target and a small set of representative tests that every team uses as its reference.

Keep this preparation short. Specify only what teams need to work independently; evolve the contracts through the first working implementation. Runtime ownership and compilation fidelity are already decided and should not be reopened by individual agents.

**2. Assign parallel workstreams**

Each row is a separate agent assignment with one accountable owner. Dependencies describe integration requirements; teams can start against agreed contracts before the upstream implementation is complete.

| ID  | Workstream                    | Responsibility and deliverable                                                                                                                 | Depends on                                |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| A   | Compilation                   | Make tests a consumer of Next's real compilation pipeline, preserving application environments and producing reusable compiled tests.          | Shared contracts                          |
| B   | Execution and isolation       | Execute compiled tests in a Next-owned runtime with reliable worker lifecycle, cleanup, cancellation, and state isolation.                     | A                                         |
| C   | Vitest test lifecycle         | Implement compatible test declarations, collection, hooks, fixtures, retries, and execution semantics.                                         | B                                         |
| D   | Assertions and test utilities | Provide compatible assertions, custom matchers, snapshots, spies, and authoring types, reusing suitable libraries.                             | C's test-context contract                 |
| E   | RSC rendering                 | Render isolated server-component subtrees through the real renderer and expose useful assertions with explicit client boundaries.              | A, B                                      |
| F   | Request and cache fixtures    | Supply realistic request context and controlled cache lifetimes for rendering and integration tests.                                           | B, E                                      |
| G   | Module mocking                | Implement the advertised Vitest mocking behavior through Next/Turbopack, preserving isolation and making unsupported behavior explicit.        | A, B, C                                   |
| H   | Real-browser testing          | Provide browser/server fixtures, full-app e2e, and later component integration. Reuse `instant()` and preserve its semantics.                  | B, C; A, E, F for component integration   |
| I   | CLI and configuration         | Provide the entry point, configuration, discovery, profile selection, and orchestration that connect the system.                               | Shared contracts; integrates A–H          |
| J   | Incremental testing           | Reuse compilation and select affected tests from Next's dependency information without missing relevant tests.                                 | A, B, I                                   |
| K   | Diagnostics and tooling       | Deliver actionable failures, reporting, source attribution, and browser artifacts; add coverage and editor integration as separate increments. | Shared result contract; integrates B–I    |
| L   | Independent validation        | Maintain the reference applications, Vitest conformance suite, isolation checks, and development/production/browser acceptance suite.          | Starts immediately; validates all streams |
| M   | Documentation and adoption    | Document supported behavior, migration, examples, and limitations; verify the experience from a user's perspective.                            | Agreed scope; follows integrated behavior |

Larger streams can be divided into bounded assignments—for example, snapshots and spies, browser e2e and component integration, or reporting and editor tooling. The stream owner remains responsible for their shared contract and integration. Avoid assigning multiple agents overlapping ownership of shared infrastructure.

**3. Prove a small complete path first**

Start A–E, H, I, and L in parallel, with K defining the result contract. Each builds only what is necessary for the first milestone. F and G should assess their contract requirements early so request context and mocking do not require a later architectural redesign. J and M can begin planning and reference work.

The first milestone must demonstrate:

- An ordinary unit test authored with familiar Vitest APIs runs through the Next-owned compiler and runtime.
- An async Server Component with a server-only dependency, nested async work, and a Client Component renders correctly through that same system.
- Invalid boundary behavior fails, and separate test executions do not leak state.
- A real-browser e2e test asserts the shell with `instant()` and the completed UI after release.
- A minimal command runs these tests and reports useful failures.

Validate this path against a normal Next application and include an early production check. Do not expand every API before the compiler, runtime, runner, and renderer work together.

**4. Expand capabilities in parallel**

After the first path works, teams expand their own surfaces: Vitest lifecycle and utilities, request/cache fixtures, module mocking, browser component integration, incremental execution, diagnostics, and adoption.

Use dependency gates rather than a single global phase barrier. For example, browser e2e can advance while component rendering is still developing; snapshots can advance while module mocking is incomplete. Integrate each capability as soon as its dependencies and acceptance checks are satisfied.

Keep a published compatibility checklist. Supported APIs must match their promised behavior, and unsupported APIs must fail clearly. Configuration, plugins, reporters, coverage, and editor integration have their own compatibility targets; test-authoring compatibility does not automatically supply them.

**5. Harden and release**

Once the agreed feature set is integrated, concentrate parallel effort on compatibility gaps, concurrency and cleanup, production behavior, browser coverage, performance, packaging, and documentation.

Release gates:

- Application behavior matches the corresponding real Next environment.
- All advertised Vitest API compatibility checks pass.
- Runtime ownership remains with Next throughout execution.
- Request, module, cache, and browser isolation hold under parallel execution and failure.
- Incremental runs remain correct when compared with full runs.
- Critical browser flows pass in development and production, including `instant()` where enabled.
- Ordinary production builds contain no testing infrastructure.
- Performance is measured, and limitations are explicit.

Start with App Router, Node, and Turbopack. Broader runtime/platform support and advanced tooling should be separate increments with their own acceptance gates.

**Parallel-agent operating rules**

- Give every agent the architecture, this plan, its owned workstream, required inputs, expected deliverable, and acceptance criteria.
- Use separate worktrees and small reviewable changes. Assign one owner to shared contracts and integration files.
- Agree interface changes with affected owners before implementing them. Agents should not repair missing dependencies by building competing infrastructure.
- Temporary stand-ins may unblock local development, but completion requires integration with the real dependency and its acceptance checks.
- Each handoff states what is complete, evidence of validation, remaining limitations, and what downstream teams can now consume.
- Integrate continuously. The lead verifies each combined milestone; independent validation checks the system against real Next behavior and the Vitest contract.

An assignment is complete when its deliverable works through the agreed boundaries, its checks pass, and the integration lead can consume it without another design exercise.
