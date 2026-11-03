import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

describe('cache-components-navigation-cache-miss', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function navigate(slug: string) {
    const responses: Playwright.Response[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.on('response', (response) => {
          const request = response.request()
          if (
            new URL(request.url()).pathname === '/items/' + slug &&
            request.headers().rsc === '1'
          ) {
            responses.push(response)
          }
        })
      },
    })
    await browser.eval('window.__beforeNavigation = true')
    await browser.elementById(slug).click()
    await retry(async () => {
      expect(await browser.elementById('slug').text()).toBe(slug)
    })
    expect(responses.length).toBeGreaterThan(0)
    return { browser, responses }
  }

  it('renders a generated path and writes its entry when a navigation misses the cache', async () => {
    const { browser, responses } = await navigate('static')
    expect(await browser.eval('window.__beforeNavigation')).toBe(true)
    for (const response of responses) {
      expect(response.status()).toBe(200)
      expect(response.headers()['x-nextjs-postponed']).toBeUndefined()
    }

    const document = await next.fetch('/items/static')
    expect(document.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(document.headers.get('x-nextjs-postponed')).toBeNull()
  })
})
