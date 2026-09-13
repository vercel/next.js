import { nextTestSetup } from 'e2e-utils'
import { instant } from '@next/playwright'
import { getRedboxSource, retry, waitForRedbox } from 'next-test-utils'
import type * as Playwright from 'playwright'

describe('devtools basePath', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('prefixes error overlay requests with basePath', async () => {
    const devtoolsRequestPaths = new Set<string>()
    const devtoolsResponses: Array<{
      pathname: string
      method: string
      status: number
      contentType: string | undefined
    }> = []
    const browser = await next.browser('/base/browser/uncaught', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const pathname = new URL(request.url()).pathname

          if (
            pathname.includes('/__nextjs_font/') ||
            pathname.endsWith('/__nextjs_original-stack-frames')
          ) {
            devtoolsRequestPaths.add(pathname)
          }
        })
        page.on('response', (response) => {
          const request = response.request()
          const pathname = new URL(response.url()).pathname

          if (
            pathname.includes('/__nextjs_font/') ||
            pathname.endsWith('/__nextjs_original-stack-frames')
          ) {
            devtoolsResponses.push({
              pathname,
              method: request.method(),
              status: response.status(),
              contentType: response.headers()['content-type'],
            })
          }
        })
      },
    })

    await browser.elementByCss('button').click()
    await waitForRedbox(browser)
    await browser.waitForIdleNetwork()

    await retry(() => {
      expect([...devtoolsRequestPaths]).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^\/base\/__nextjs_font\/.+\.woff2$/),
          '/base/__nextjs_original-stack-frames',
        ])
      )
      expect(devtoolsResponses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: expect.stringMatching(
              /^\/base\/__nextjs_font\/.+\.woff2$/
            ),
            method: 'GET',
            status: 200,
            contentType: 'font/woff2',
          }),
          {
            pathname: '/base/__nextjs_original-stack-frames',
            method: 'POST',
            status: 200,
            contentType: 'application/json',
          },
        ])
      )
    }, 10_000)

    expect(devtoolsRequestPaths.has('/__nextjs_original-stack-frames')).toBe(
      false
    )
    expect(
      [...devtoolsRequestPaths].some((pathname) =>
        pathname.startsWith('/__nextjs_font/')
      )
    ).toBe(false)
  })

  it('resolves stack frames during an instant scope', async () => {
    let page: Playwright.Page | undefined
    const browser = await next.browser('/base/browser/uncaught', {
      beforePageLoad(currentPage) {
        page = currentPage
      },
    })

    if (!page) {
      throw new Error('Expected the browser page to be initialized')
    }

    await instant(page, async () => {
      await browser.elementByCss('button').click()
      await waitForRedbox(browser)

      await retry(async () => {
        expect(await getRedboxSource(browser)).toContain(
          "throw new Error('devtools basePath test error')"
        )
      }, 10_000)
    })
  })
})
