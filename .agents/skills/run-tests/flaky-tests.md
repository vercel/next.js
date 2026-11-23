# Reproducing and Fixing Flaky Tests

## Reproduce first

- Record the CI signature before changing code: test file, case, assertion,
  mode, bundler, env flags, run, attempt, and commit SHA.
- Reproduce in the same mode and bundler. Take an unmodified baseline count
  before trying a fix.
- Many flakes need CPU pressure. Try both:
  - Pin the test and a few busy loops to one CPU, for example with `taskset`.
  - Run busy loops across all CPUs while increasing test concurrency.
- Compare results only on the same commit, command, load, and machine.
- Use `node run-tests.js --retries 0 --runs <n> --concurrency 1 <file>` for
  whole-file repeats. Use a Jest script with `-t` for one case.
- Artificial delays can help explain a race, but they are not a substitute for
  reproducing the CI-equivalent failure.
- To find a race, write timestamped request or event logs to a separate file
  for each run. Don't use timestamps from buffered output as timing data.

## Write flake-safe tests

- Use `retry()` or event-driven waits, never fixed sleeps.
- In dev mode, a newly visited route may compile on demand. Give the destination
  page a stable selector and wait for it before asserting page content.
- Control client-router requests with `createRouterAct` and `LinkAccordion`
  (`$router-act`). Waiting for network idle can include unrelated prefetches.
- A Playwright `page.click()` on an interactive element can delay a later
  `requestIdleCallback` on a static page until something renders. If a test
  depends on an idle callback, check whether a DOM `element.click()` is the
  right trigger.
- Flake detection runs added or changed test files three times concurrently
  with `--retries 0` (`scripts/test-new-tests.mjs --flake-detection`). A fix
  should pass repeated `node run-tests.js --retries 0 --runs 3 <file>` runs.
- Don't wrap Jest snapshot matchers in `retry()`. Poll a plain value, then
  assert the snapshot once.
- Keep concurrent runs independent: use unique mutable files and dynamic ports
  (`server.listen(0)` or `findPort()`). See `contributing/core/testing.md`.
- Adding a test to an existing file makes flake detection run that file. Put an
  unrelated test in a new suite if the existing file has unrelated
  concurrency hazards.
- Close servers and connections in teardown. A suite whose assertions passed
  can still fail when `afterAll` times out.

## Report and bisect

- Report raw counts per case and load, such as "7 of 17 runs". Avoid rates,
  "never", or "always" from small samples.
- Label results as observed or inferred. Present a mechanism as a hypothesis
  until evidence distinguishes it from alternatives.
- A green rerun on the same SHA shows intermittency. It doesn't prove the PR is
  unrelated.
- Bisect scripts should fail closed. Mark a commit good only when the expected
  test ran and passed. Use exit `125` for unrelated failures.
- Detect the bug with a stable condition when error text changes over history.
  Keep each run's logs in its own directory and give parallel test binaries
  separate cache directories.
