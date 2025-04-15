// Duplicate the test file of graceful-degrade-error-bot.test.ts since we need to
// restart with a new browser context for UA setting. Otherwise the browser context
// will not be closed and reset properly. TODO: investigate why browser.close didn't help.

import { nextTestSetup } from 'e2e-utils'
import { deleteBrowserDynamicChunks } from '../delete-dynamic-chunk'

describe('graceful-degrade - custom-error - non bot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Delete client chunks to simulate chunk loading failure
  beforeAll(() => {
    deleteBrowserDynamicChunks(next)
  })

  it('should not degrade to graceful error when chunk loading fails in ssr for non-bot user agents', async () => {
    const browser = await next.browser('/blog')

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).toMatch(/Failed to load resource./)
    // Should show the same layout content
    const html = await browser.elementByCss('html')
    const body = await browser.elementByCss('body')
    expect(await html.getAttribute('class')).toBe('layout-cls')
    expect(await body.getAttribute('class')).toBe('body-cls')

    // Show the custom error boundary text
    const errorBoundaryText = await browser
      .elementByCss('.error-boundary')
      .text()
    expect(errorBoundaryText).toMatch(/Custom error boundary/)
  })
})
