import { nextTestSetup } from 'e2e-utils'
import { deleteBrowserDynamicChunks } from './delete-dynamic-chunk'

describe('graceful-degrade-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Delete client chunks to simulate chunk loading failure
  beforeAll(() => {
    deleteBrowserDynamicChunks(next)
  })

  it('should degrade to graceful error when chunk loading fails in ssr for bot', async () => {
    const browser = await next.browser('/', {
      userAgent: 'Googlebot',
    })

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).toMatch(/Failed to load resource./)
    // Should show the original content
    const originHtml = await browser.elementByCss('html')
    const originBody = await browser.elementByCss('body')
    expect(await originHtml.getAttribute('class')).toBe('layout-cls')
    expect(await originBody.getAttribute('class')).toBe('body-cls')

    // Do not contain the global error boundary text
    const bodyText = await originBody.text()
    expect(bodyText).not.toMatch(
      /Application error: a client-side exception has occurred while loading/
    )
  })
})
