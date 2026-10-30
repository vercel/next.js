# PR #100918 review harness

Scenarios used to review [vercel/next.js#100918](https://github.com/vercel/next.js/pull/100918) (Turbopack native dev route discovery) at its head commit, `d35ecdd595`. Each scenario starts `next dev` on a small fixture, edits files and requests pages on a schedule, and prints what the server did. The full write-up, with code links and suggested fixes, is the private Notion page "PR #100918 review: Turbopack native dev route discovery".

This directory is review tooling for that PR. It is not part of the PR and should not be merged.

## Running

The checkout needs a build of the PR: `packages/next/dist`, and a native binary in `packages/next-swc/native/` that includes the PR's Rust changes. `pnpm build-all` produces both, or copy them from a worktree that already has them.

```bash
pr-100918-review/run.sh all
pr-100918-review/run.sh f4-metadata-syntax-error
pr-100918-review/run.sh f3-canonical-interception --webpack
```

Each fixture is created under `test/tmp/review/<scenario>` (gitignored), and its full log is written to `test/tmp/review/<scenario>.log`. Scenarios run one at a time.

`f1-node-modules-next-missing` renames `node_modules/next` while the server runs. The driver renames it back when the scenario ends or on Ctrl-C. If the driver is killed some other way, restore it with `mv node_modules/next.stash-review node_modules/next`.

## Scenarios

Each entry names the finding it reproduces, what it prints on `d35ecdd595`, and what it should print once that finding is fixed.

- `f1-node-modules-next-missing`, finding 1. Now: `FATAL: An unexpected Turbopack error occurred: Next.js package not found`, then `next dev exited code=1`. Fixed: "Could not find the Next.js package" is printed, the server stays up, and `/late-route` returns 200 after the restore.
- `f2-exportpathmap-throw`, finding 2. Now: `Error: exportPathMap failed (simulated)`, then `next dev exited code=1`. Fixed: the error is logged and the last `fetch /` returns 200.
- `f2-rewrites-throw`, finding 2. Now: `Error: rewrites source unavailable (simulated)`, then `next dev exited code=1`. Fixed: the error is logged and the last `fetch /` returns 200.
- `f3-canonical-interception`, finding 3. Now: `GET / 500` with the interception route error, and no `looseRouteMatching` line. Fixed: the route error and the `deprecated.looseRouteMatching` hint are printed without a request.
- `f3-unmatched-app-pages`, finding 3. Now: `GET / 500`, and no `looseRouteMatching` line. Fixed: same as above.
- `f4-metadata-syntax-error`, finding 4. Now: `/other` returns 500 while `app/sitemap.ts` is broken, and the control step keeps it at 200. Fixed: `/other` stays at 200 throughout.
- `f5-slow-rewrites`, finding 5. Now: the `fetch /` after adding a route takes 6.5 to 7 s, against about 60 ms before. Fixed: that request returns in well under a second.

Findings 6 to 8 (env types, the `next-head` test and the ESLint error) have no scenario. They show up in CI and in `eslint`.

## Sandbox notes

These only matter inside the Claude Code sandbox:

- FSEvents is unavailable, so every fixture sets `watchOptions.pollIntervalMs` and the driver sets `WATCHPACK_POLLING=true`. Polling is harmless elsewhere.
- `pnpm` fails on its store lock, so the driver runs `packages/next/dist/bin/next` with `node` directly. The jest e2e harness also fails to start (no FSEvents), so test results have to come from CI.
