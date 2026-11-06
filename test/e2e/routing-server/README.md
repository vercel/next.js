# Server-router regression gate

`pnpm test-routing` runs the e2e tests that check the server router's observable HTTP and browser behavior: every test under this directory, plus the existing suites listed in [`test/routing-tests-manifest.json`](../../routing-tests-manifest.json). The suite passes on today's server, so after you change the server, any failure is a regression.

```bash
pnpm test-routing
```

It runs the selected files through `run-tests.js`, first with `next build` and `next start`, then with `next dev`, using Turbopack and the same environment variables as the matching CI job. Bootstrap and build the repository first, as for any e2e run.

Use Node.js 24.21 or later, for example `fnm exec --using=24 pnpm test-routing`. Earlier versions lack a [`realpath` fix](https://github.com/nodejs/node/pull/65113), without which a dev fixture can load React twice and time out.

| Option                                     | What it does                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `--mode=start`, `--mode=dev`               | Runs one mode instead of start, then dev.                                                 |
| `--bundler=webpack`, `--bundler=rspack`    | Uses another bundler instead of Turbopack. Rspack also applies the Rspack test manifests. |
| A path such as `test/e2e/routing-server`   | Runs only the manifest files under that path.                                             |
| `--list`                                   | Prints the files each mode would run, then exits.                                         |
| Anything else, such as `-c 2` or `--debug` | Passed to `run-tests.js`. Concurrency defaults to 4 files at a time.                      |

A `run-tests.js` retry resets the file's directory with `git clean -fdx` and `git checkout`, so when a selected test directory has untracked files or unstaged edits, `pnpm test-routing` turns retries off. Stage your test changes to keep them on.

Tests assert what the server does today. A test for documented behavior the server doesn't have yet runs behind `@gate`, with a `TODO` that explains the failure and links the docs it contradicts.
