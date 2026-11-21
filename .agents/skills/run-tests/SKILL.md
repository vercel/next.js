---
name: run-tests
description: >
  Run Next.js tests reliably in a fresh checkout or worktree, and reproduce or
  fix flaky tests. Use for Playwright browser install errors, missing build
  outputs, pnpm test-unit or Jest selection surprises, run-tests.js repeats,
  CI env flags for snapshot tests, native binding selection, ignored fixture
  files such as tsconfig.json or target directories, CI-only test type/lint
  gates, CPU-starved flakes, fixed waits, requestIdleCallback starvation, or
  flake-detection failures.
metadata:
  internal: true
---

# Run Tests

Use this skill when running, adding, or debugging tests in the Next.js repo.
The basic commands are in the root `AGENTS.md`. For flaky tests, read
[flaky-tests.md](./flaky-tests.md).

## Bootstrap a fresh checkout

1. Run `pnpm install --frozen-lockfile`. If you are deliberately building native
   bindings from source and the native postinstall fails, use
   `NEXT_SKIP_NATIVE_POSTINSTALL=1` (see `scripts/install-native.mjs`).
2. Build JS with workspace dependencies: `pnpm build`. In a fresh checkout, a bare
   `pnpm --filter=next build` can miss workspace outputs such as polyfills.
3. Install the browser version that matches the repo's Playwright:
   `pnpm exec playwright install chromium`. A different Chromium can still fail
   with `Executable doesn't exist`.
4. Rust or Turbopack changes need a native build before Next.js e2e tests. See
   the root `AGENTS.md` rebuild rules.

## Choose the command

- Mode-specific scripts such as `pnpm test-dev-turbo` call `scripts/run-jest.sh`
  and set the mode and bundler.
- A dev-only test can be skipped by `test-start-*`. Check `isNextDev`, gates,
  and the CI job before choosing a command.
- `pnpm test-unit <file>` appends `<file>` to
  `jest test/unit/ packages/next/ packages/font`, so it can run all of those
  suites. Use `pnpm exec jest <file>` for one file.
- Jest only searches the `roots` in `jest.config.js`. A copied test outside
  those roots reports `No tests found`. Use a temporary worktree for experiments.
- `node run-tests.js` is the CI runner:
  - `--retries 0 --runs N` repeats each selected file; repeats require
    `--retries 0`.
  - `--concurrency 1` serializes files.
  - `--debug` shows test output.
  - It selects files, not individual test names. Use a Jest script with `-t` to
    focus one case.

## Match CI

- Inline snapshots can depend on CI env flags. Use the exact `afterBuild:` flags
  from `.github/workflows/build_and_test.yml`, keep them set for the full run,
  and use the same bundler. For example `build-output-prerender` expects
  `__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES=true`.
- For exact replication of a failed job, use `$pr-status-triage` and its
  `local-repro.md`.
- Isolated installs use a `.node` file from `packages/next-swc/native` when
  present; otherwise they use the installed `@next/swc-*` package. Check the
  logged `swcNativeDirectory` before trusting a native-binding repro.
- `nextTestSetup({ dependencies })` installs dependencies in the isolated app.
  A `require()` in the Jest test file still resolves from the repo. Run
  isolated tools as child processes with their `cwd` in the test app.
- New `test/e2e` suites also run in deploy mode. Read `test/AGENTS.md` before
  adding file patches or log assertions.

## Quick smoke testing

For fast feedback, generate a fixture with
`pnpm new-test --args true <name> e2e`. Run Next.js with the fixture as the
working directory and an absolute path to the built CLI:

```bash
cd <fixture-dir>
node <repo>/packages/next/dist/bin/next dev --port <port>
```

Probe it with `curl --max-time 10`. If a throwaway app symlinks packages from
the checkout, link `next`, `react`, and `react-dom` individually. Set
`turbopack.root` and `outputFileTracingRoot` to a common parent when the build
needs to resolve the linked `next` package.

## Commit fixtures completely

- `test/.gitignore` ignores `tsconfig.json` under `e2e/**`, `production/**`,
  and `development/**`. If the fixture needs that file, force-add it with
  `git add -f`. Don't force-add generated `next-env.d.ts`.
- The root `.gitignore` ignores any directory named `target`, including a
  fixture route. Use another directory name.
- Before pushing, compare the tracked fixture files with the files the test
  needs. Use `git ls-tree -r --name-only HEAD -- <dir>`, or
  `git check-ignore -v <path>` for a single path.

## Gates beyond the test run

- `pnpm --filter=next types` uses `tsconfig.build.json`, which excludes tests.
  When test files change, run `pnpm lint-typescript` (or the full
  `pnpm types-and-precompiled` when its clean-tree check is appropriate).
- `pnpm lint-language` runs `alex` on Markdown files. After editing docs, run
  `pnpm exec alex <files> --quiet`.
- CI checks the PR merged with current canary. If Prettier passes locally but
  fails in CI, compare `.prettierignore` and the formatter config with canary.
- Common test-file ESLint rules include `jest/no-standalone-expect` and
  `@typescript-eslint/prefer-as-const`.
- Treat unexpected snapshot churn as a possible regression. Find the source of
  the output change before updating snapshots.

## Related Skills

- `$pr-status-triage` - CI failure triage and exact CI env reproduction
- `$gate-tests` - `@gate` / `@force-gate` instead of skips
- `$router-act` - deterministic client-router tests
