import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('middleware-dynamic-basepath-matcher-rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('preserves router.query on client-side navigation to a catch-all page', async () => {
    const browser = await next.browser('/docs')
    await browser.elementById('catchall-link').click()

    await retry(async () => {
      expect(await browser.elementById('page-title').text()).toBe('CatchAll')
    })

    expect(await browser.elementById('query-path').text()).toBe('["first"]')
  })
})
