import { nextTestSetup } from 'e2e-utils'
import type { Page } from 'playwright'

describe('proxy overriding RSC request headers', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should navigate with a single request when the proxy overrides a header the _rsc param is a hash of', async () => {
    const rscResponses: { url: string; status: number; prefetch: boolean }[] =
      []
    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        page.on('response', (response) => {
          const url = response.url()
          if (url.includes('_rsc=')) {
            rscResponses.push({
              url,
              status: response.status(),
              prefetch:
                response.request().headers()['next-router-prefetch'] !==
                undefined,
            })
          }
        })
      },
    })

    // Only survives a soft navigation.
    await browser.eval('window.__soft = true')
    await browser.elementById('to-dest').click()
    await browser.waitForElementByCss('#dest')

    expect(await browser.elementById('stamp').text()).toBe('/dest')
    expect(await browser.eval('window.__soft')).toBe(true)

    const targetResponses = rscResponses.filter(({ url }) =>
      new URL(url).pathname.endsWith('/dest')
    )
    // Prefetches may precede the navigation, but nothing gets redirected.
    expect(targetResponses.map(({ status }) => status)).not.toContain(307)
    expect(
      targetResponses
        .filter(({ prefetch }) => !prefetch)
        .map(({ status }) => status)
    ).toEqual([200])
  })
})
