import { nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox } from 'next-test-utils'

// @force-gate dev && turbopack
describe('lazy-dynamic-chunk-list-collision', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders a shared dynamic target with nested lazy imports from parallel branches', async () => {
    expect((await next.fetch('/')).status).toBe(200)
    const browser = await next.browser('/')
    await retry(async () => {
      expect(
        await browser.elementsByCss('[data-hydrated="true"]')
      ).toHaveLength(2)
    })
    await waitForNoRedbox(browser)
  })
})
