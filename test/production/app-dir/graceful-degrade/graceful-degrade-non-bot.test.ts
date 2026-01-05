// Duplicate the test file of graceful-degrade-error-bot.test.ts since we need to
// restart with a new browser context for UA setting. Otherwise the browser context
// will not be closed and reset properly. TODO: investigate why browser.close didn't help.

import { nextTestSetup } from 'e2e-utils'
import { deleteBrowserDynamicChunks } from './delete-dynamic-chunk'

describe('graceful-degrade - non bot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Delete client chunks to simulate chunk loading failure
  beforeAll(() => {
    deleteBrowserDynamicChunks(next)
  })

  it('should show banner and preserve frozen content when chunk loading fails for non-bot user agents', async () => {
    const browser = await next.browser('/chunk-loading-failed')

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).toMatch(/Failed to load resource./)

    const body = await browser.elementByCss('body')
    const bodyText = await body.text()

    // Chunk load errors show a banner instead of full-page error
    expect(bodyText).toMatch(/This page couldn't be fully loaded/)
    // Banner should NOT show the "This page crashed" full-page error
    expect(bodyText).not.toMatch(/This page crashed/)
  })

  it('should show error boundary when browser errors when error boundary is defined', async () => {
    const browser = await next.browser('/browser-crash-error-boundary')

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).toMatch(/Error: boom/)

    const bodyText = await browser.elementByCss('body').text()
    expect(bodyText).toMatch(/Custom error boundary/)
    expect(bodyText).not.toMatch(/fine/)
  })
})
