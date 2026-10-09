# Next.js Upgrade

`@next/upgrade` owns the upgrade CLI, upgrade checks, and agent and terminal
nudges. Next.js vendors one integration bundle while retaining its
configuration, telemetry, and worker lifecycle integration.

Run `pnpm --filter=@next/upgrade build` to build the standalone distribution.
Unit tests live beside their source files; distribution and compatibility tests
live in `test/`. Upgrade evals live in the repository-level `evals/next-upgrade/`.

The standalone command is `npx @next/upgrade@canary --agent=latest`. The existing
`next upgrade` command launches this tool through the app's package manager.
The CLI does not relaunch a fresh Next installation. The `next upgrade` launcher
retains invocation telemetry and supplies its own config and telemetry graph,
including when the app has an older Next installed. Direct standalone commands
resolve the app's own graph lazily; help and version need no Next.
The config/environment/consent adapters have compatibility coverage for Next
13.5.11, 15.5.0, 16.0.0, and the workspace candidate.

CLI libraries are bundled from this package's development dependencies. Next
vendors the integration entry, so changes to a CLI library require inspecting
that entry's imports when deciding whether to update the framework bundle.
Workflow guides and their referenced upgrade documents are copied into `dist`.
