import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for multi-value (repeated key) search param transitions.
//
// Reproductions:
//  - https://github.com/vercel/next.js/issues/94821 (next/form submit)
//  - https://github.com/vercel/next.js/issues/92787 (<Link> navigation)
//  - https://github.com/vercel/next.js/issues/93104 (router.replace)
//
// Root cause: the client builds the page segment cache key with
// `Object.fromEntries(new URLSearchParams(search))`, which only keeps the
// LAST value of a repeated key. So `?f=a&f=b` and `?f=b` both collapse to
// `{ f: 'b' }`, producing identical cache keys. The multi -> single
// transition is treated as a cache hit and the page never re-renders with
// the new (single) search param value, leaving stale server-rendered output.
describe('multi-value-search-params-stale', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('updates server-rendered output on multi -> single transition via <Link>', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: []'
      )
    })

    // [] -> [a]
    await browser.elementById('link-a').click()
    await retry(async () => {
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: ["a"]'
      )
    })

    // [a] -> [a, b]
    await browser.elementById('link-b').click()
    await retry(async () => {
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: ["a","b"]'
      )
    })

    // [a, b] -> [b]  (the buggy transition: removing the first repeated value)
    await browser.elementById('link-a').click()
    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.search).toBe('?f=b')
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: ["b"]'
      )
      expect(await browser.elementById('server-count').text()).toBe(
        'server count: 1'
      )
    })
  })

  it('updates server-rendered output on multi -> single transition via router.replace', async () => {
    const browser = await next.browser('/')

    // [] -> [a]
    await browser.elementById('replace-a').click()
    await retry(async () => {
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: ["a"]'
      )
    })

    // [a] -> [a, b]
    await browser.elementById('replace-b').click()
    await retry(async () => {
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: ["a","b"]'
      )
    })

    // [a, b] -> [b]
    await browser.elementById('replace-a').click()
    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.search).toBe('?f=b')
      expect(await browser.elementById('server-values').text()).toBe(
        'server values: ["b"]'
      )
    })
  })
})
