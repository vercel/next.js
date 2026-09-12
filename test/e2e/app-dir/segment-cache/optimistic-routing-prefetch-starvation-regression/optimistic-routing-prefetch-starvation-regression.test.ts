import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Regression test for a starvation bug in the prefetch scheduler
// (issue #96965). When more sibling URLs of a dynamic route are prefetched in
// one tick than the scheduler's concurrent request limit allows, the excess
// tasks wait for bandwidth. The first responses to arrive teach the optimistic
// routing trie the route's pattern, so when a waiting task finally runs, its
// cache lookup matches a synthetic (predicted) route entry and the task
// completes without ever fetching the URL's own route tree. Every later
// prefetch of that URL hits the same synthetic entry, so the URL can never be
// warmed for the lifetime of the page.
describe('optimistic routing prefetch starvation', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  it('fetches the route tree of every sibling prefetched in the same tick, beyond the concurrent request limit', async () => {
    const treeRequests = new Set<string>()
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.on('request', (request) => {
          if (request.headers()['next-router-segment-prefetch'] === '/_tree') {
            treeRequests.add(new URL(request.url()).pathname)
          }
        })
      },
    })

    // Schedule all five sibling prefetches in the same tick. The concurrent
    // request limit is four, so the first-scheduled sibling (the task queue is
    // most-recent-first) waits for bandwidth while the others' responses
    // arrive and teach the route's pattern.
    await browser.elementByCss('[data-prefetch-all]').click()

    await retry(async () => {
      expect([...treeRequests].sort()).toEqual([
        '/products/alpha',
        '/products/bravo',
        '/products/charlie',
        '/products/delta',
        '/products/echo',
      ])
    })
  })
})
