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

  it('should not degrade to graceful error when chunk loading fails in ssr for non-bot user agents', async () => {
    const browser = await next.browser('/chunk-loading-failed')

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).toMatch(/Failed to load resource./)
    // Should not show the original content
    const html = await browser.elementByCss('html')
    const body = await browser.elementByCss('body')
    expect(await html.getAttribute('class')).not.toBe('layout-cls')
    expect(await body.getAttribute('class')).not.toBe('body-cls')

    const bodyText = await body.text()
    expect(bodyText).toMatch(
      /Application error: a client-side exception has occurred while loading/
    )
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
