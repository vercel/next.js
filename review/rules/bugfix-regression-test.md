# Bugfix regression test

rule: A bugfix comes with a test that fails without the fix and passes with it.

severity: escalate (strong) for runtime code: `packages/next/src/{server,client,build,shared}/**`, `crates/**`, `turbopack/crates/**`. Escalate (medium) elsewhere (CLI, dev overlay, create-next-app), where a test isn't always feasible and a stated reason is enough. The only exception for runtime code is an extreme case where no test can show the bug, and the PR explains why.

## Signs in review

- A PR described as a fix (title, `fixes #`, "bug", "regression") with no new or changed test
- A new test that never reaches the changed code: trace from the test's setup to the fixed line. If it can't get there, it would pass on base too.
- The only new test is a unit test of internals (a helper's return value) when the bug is user-visible. See [test-public-behavior](test-public-behavior.md).

## Example

Bad: the fix changes `packages/next/src/server/app-render/action-handler.ts` and the PR says "tested manually".

Good: an e2e test that goes through the public surface, and fails on canary:

```ts
// test/e2e/app-dir/actions-redirect-search-params/actions-redirect-search-params.test.ts
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server action redirect', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('keeps search params on the redirect target', async () => {
    const browser = await next.browser('/form')
    await browser.elementByCss('button').click()
    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe('/result?from=form')
    })
  })
})
```

## Why

The test is what keeps the bug from coming back. A test that passes without the fix proves nothing.

TODO: a script that runs the PR's new tests against the base branch's code and confirms they fail there, so the reviewer doesn't have to trace by hand.
