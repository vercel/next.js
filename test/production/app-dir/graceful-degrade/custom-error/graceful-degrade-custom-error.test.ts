import { nextTestSetup } from 'e2e-utils'
import { deleteBrowserDynamicChunks } from '../delete-dynamic-chunk'

describe('graceful-degrade - custom error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Delete client chunks to simulate chunk loading failure
  beforeAll(() => {
    deleteBrowserDynamicChunks(next)
  })

  it('should degrade to graceful error when chunk loading fails in ssr for bot', async () => {
    const browser = await next.browser('/blog', {
      userAgent: 'Googlebot',
    })

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).toMatch(/Failed to load resource./)
    // Should show the original content
    const html = await browser.elementByCss('html')
    const body = await browser.elementByCss('body')
    expect(await html.getAttribute('class')).toBe('layout-cls')
    expect(await body.getAttribute('class')).toBe('body-cls')

    // Do not contain the custom error boundary text
    const bodyText = await body.text()
    expect(bodyText).not.toMatch(/Custom error boundary/)
  })
})
