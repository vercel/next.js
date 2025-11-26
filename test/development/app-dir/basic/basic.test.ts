import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'
import { waitForHydration } from 'development-sandbox'

describe('basic app-dir tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should reload app pages without error', async () => {
    const browser = await next.browser('/')
    await browser.refresh()
    await waitForHydration(browser)

    await waitForNoRedbox(browser)
  })
})
