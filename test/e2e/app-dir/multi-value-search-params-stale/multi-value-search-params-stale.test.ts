import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for multi-value (repeated key) search param transitions.
//
// Reproductions:
//  - https://github.com/vercel/next.js/issues/94821 (next/form submit)
//  - https://github.com/vercel/next.js/issues/92787 (<Link> navigation)
//  - https://github.com/vercel/next.js/issues/93104 (router.replace)
//
// The client built the page segment cache key with
// `Object.fromEntries(new URLSearchParams(search))`, which only keeps the
// LAST value of a repeated key. So `?foo=bar&foo=baz` and `?foo=baz`
// collapsed to the same key, the multi -> single transition was treated as a
// cache hit, and the page never re-rendered with the new search params.
describe('multi-value-search-params-stale', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('re-renders when a repeated search param goes from multiple values to one', async () => {
    const browser = await next.browser('/')

    async function expectParams(expected: unknown) {
      await retry(async () => {
        const text = await browser.elementById('search-params').text()
        expect(JSON.parse(text)).toEqual(expected)
      })
    }

    await expectParams({})

    await browser.elementById('to-bar').click()
    await expectParams({ foo: 'bar' })

    await browser.elementById('to-bar-baz').click()
    await expectParams({ foo: ['bar', 'baz'] })

    // The buggy transition: multiple values -> a single value.
    await browser.elementById('to-baz').click()
    await expectParams({ foo: 'baz' })
    expect(new URL(await browser.url()).search).toBe('?foo=baz')
  })
})
