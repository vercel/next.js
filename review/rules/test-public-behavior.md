# Test public behavior

rule: Tests go through public behavior. A bugfix's regression test is an e2e test. Unit, model, and property tests are welcome in addition to one, not instead of it.

severity: medium. A unit test that reaches into internals is fine when the PR says why an e2e test can't show the behavior, e.g. a pure algorithm with many edge cases, or a crate with no JS surface.

## Signs in review

- A test that imports from `packages/next/src/**` to call a helper directly, when the behavior it checks is user-visible
- A bugfix whose only new test is a unit, model, or property test
- A test that asserts on internal state (cache map contents, router state shape, the number of requests) instead of what the user sees
- Router or prefetch tests that poll the network with `retry()` or timers instead of using `createRouterAct` (see [.agents/skills/router-act](../../.agents/skills/router-act/SKILL.md))

## Example

Bad: a fix to segment cache invalidation, tested by poking the internal map:

```ts
import { createCacheMap } from 'next/dist/client/components/segment-cache/cache-map'

it('evicts stale entries', () => {
  const map = createCacheMap()
  map.set(key, entry)
  invalidate(map, key)
  expect(map.get(key)).toBeUndefined()
})
```

Good: an e2e test that shows the user-visible result, using `createRouterAct` to control the network:

```ts
it('refetches the segment after revalidation', async () => {
  let page: Playwright.Page
  const browser = await next.browser('/', {
    beforePageLoad(p) {
      page = p
    },
  })
  const act = createRouterAct(page)
  await act(() => browser.elementByCss('a[href="/posts"]').click(), {
    includes: 'Post v2',
  })
})
```

A property test of the eviction logic is a good addition next to this, but it doesn't replace it.

## Why

E2E tests check what users actually depend on, and they survive refactors: the internals can be rewritten without touching the test. Tests that reach into internals break on every refactor and can pass while the user-visible behavior is broken.
