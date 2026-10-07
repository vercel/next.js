# `@next/upgrade`

Upgrades Next.js apps, with or without a coding agent. `next upgrade` and
`@next/codemod upgrade` both run this package.

```sh
npx @next/upgrade [directory] [options]
```

- Without `--agent`, it bumps `next`, React, ESLint and the optional `@next/*`
  packages to the target `--revision`, and then runs the matching
  [`@next/codemod`](../next-codemod) transforms. Each transform runs in its own
  process from the `@next/codemod` release that matches this package.
- With `--agent [security|latest|experimental-future]`, it prepares the
  upgrade guides and hands the upgrade to a coding agent. It always runs from
  the latest `@next/upgrade` canary.

`next dev` and `next build` also use this package to show upgrade reminders.

## Skip optional feature adoption

`--skip-adoption` skips codemods marked as feature adoption in
`src/codemods.ts` while keeping version migrations and normal dependency
selection. Currently this excludes `cache-components-instant-false` and the
`remove-partial-prefetch` cleanup used after adopting partial prefetching.
Both transforms can still be run explicitly with `@next/codemod`.

Combine it with `--yes` for an unattended version upgrade. Without
`--skip-adoption`, the existing upgrade selections are unchanged.

## Structure

- `src/cli.ts`: the `next-upgrade` executable
- `src/version-upgrade.ts`: the version upgrade (dependencies and codemods)
- `src/agent-upgrade.ts`: the agent upgrade and its result reporter
- `src/nudge.ts`, `src/terminal.ts`: upgrade reminders in `next dev` and
  `next build`. `src/terminal.ts` is bundled on its own, because it loads on
  every run.
- `guides/`: instructions handed to the agent. The build also bundles the
  Next.js upgrade docs they reference (`scripts/copy-assets.mjs`).
- `fixtures/`: apps for manual upgrade checks (`pnpm test:upgrade-fixture`)

This package doesn't import `next`. It loads config and telemetry from the
Next.js installed in the app being upgraded (`src/next-host.ts`), because
`next` depends on this package and an upgrade must work for older releases.
