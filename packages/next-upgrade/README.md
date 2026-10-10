# @next/upgrade

Upgrade a Next.js app from the terminal or with an agent:

```sh
npx @next/upgrade@canary /path/to/app --agent=security
```

`next upgrade` uses the same workflow inside the invoking Next process. Next
provides its config, environment, telemetry and worker integrations. The standalone
command runs agent upgrades and result reporting through a pinned Next CLI, so
config and telemetry are available when the app's Next.js is old or missing.
Ordinary upgrades invoke the codemod directly. Next is not an npm dependency of
this package.

The source stays grouped under `cli/`, `nudge/`, `shared/` and `next/`. The build
ships one bundle, its declaration graph, and the guides/docs referenced by the
workflow. Runtime dependencies are bundled; agent commands obtain the pinned
Next CLI through the app's package manager.

```sh
pnpm --filter @next/upgrade build
pnpm --filter @next/upgrade dev
pnpm --filter @next/upgrade typescript
```

Watch builds run serially and replace the bundle atomically. Run the package
watcher alongside `pnpm --filter next dev` when changing upgrade source.
