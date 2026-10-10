# @next/upgrade

Upgrade a Next.js app from the terminal or with an agent:

```sh
npx @next/upgrade@canary /path/to/app --agent=security
```

`next upgrade` uses the same workflow inside the invoking Next process. Next
provides its config, environment, telemetry and worker integrations. The standalone
command resolves config and telemetry storage from the target app's installed
Next.js, without depending on Next as an npm package.

The source stays grouped under `cli/`, `nudge/`, `shared/` and `next/`. The build
ships one bundle, its declaration graph, and the guides/docs referenced by the
workflow. Runtime dependencies are bundled; the app's Next integration stays a
runtime lookup.

```sh
pnpm --filter @next/upgrade build
pnpm --filter @next/upgrade dev
pnpm --filter @next/upgrade typescript
```

Watch builds run serially and replace the bundle atomically. Run the package
watcher alongside `pnpm --filter next dev` when changing upgrade source.
