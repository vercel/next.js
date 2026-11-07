import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Next.js restores the async context of a request in two places: every work
// store has `runInCleanSnapshot`, and the revalidations that are pending when
// the response closes run in the context of the request. In Node.js,
// `AsyncLocalStorage.snapshot()` and `AsyncLocalStorage.bind()` return a
// function from `AsyncResource.prototype.bind()`, which defines the deprecated
// `asyncResource` accessor on it. V8 keeps accessors in the old generation, so
// a minor garbage collection cannot free what the function captured: every
// async local store of the request. `instrumentation.ts` counts the calls of
// `AsyncResource.prototype.bind()`.
describe('async-context-snapshot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function boundFunctions(): Promise<number> {
    const res = await next.fetch('/api/bound-functions')
    return (await res.json()).count
  }

  it('should not bind a function to an AsyncResource for a route handler', async () => {
    const before = await boundFunctions()
    const res = await next.fetch('/api/hello')
    expect(await res.json()).toEqual({ hello: 'world' })
    // Reading the count is a route handler request as well.
    expect((await boundFunctions()) - before).toBe(0)
  })

  it('should not bind a function to an AsyncResource for a page', async () => {
    const before = await boundFunctions()
    const html = await next.render('/')
    expect(html).toContain('hello world')
    expect((await boundFunctions()) - before).toBe(0)
  })

  it('should not bind a function to an AsyncResource for a server action', async () => {
    const browser = await next.browser('/action')
    const before = await boundFunctions()
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('done')
    })
    expect((await boundFunctions()) - before).toBe(0)
  })
})
