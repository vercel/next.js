import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const MARKER = 'RUNTIME_ENTRY_SHARED_MODULE_MARKER'

describe('pages-runtime-entry-availability', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('loads a module shared by the client entry and the pages only once', async () => {
    const requests: Set<string> = new Set()
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const url = new URL(request.url(), next.url)
          if (
            url.pathname.startsWith('/_next/static/') &&
            url.pathname.endsWith('.js')
          ) {
            requests.add(url.href)
          }
        })
      },
    })

    // The scripts that the browser requested so far and that contain the shared module.
    const chunksWithSharedModule = async () => {
      const chunks = await Promise.all(
        [...requests].map(async (url) => ({
          url,
          content: await fetch(url).then((response) => response.text()),
        }))
      )
      return chunks
        .filter((chunk) => chunk.content.includes(MARKER))
        .map((chunk) => chunk.url)
    }

    expect(await browser.elementByCss('#marker').text()).toBe(MARKER)
    expect(await browser.eval('window.__instrumentationClientMarker')).toBe(
      MARKER
    )
    expect(await chunksWithSharedModule()).toHaveLength(1)

    // The chunks of the other page must not bring the module again either.
    await browser.elementByCss('#to-other').click()
    await retry(async () => {
      expect(await browser.elementByCss('#other-marker').text()).toBe(MARKER)
    })
    expect(await chunksWithSharedModule()).toHaveLength(1)
  })
})

describe('pages-runtime-entry-availability with async scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      // Renders the scripts of a production page with `async` instead of `defer`: they run in
      // the order in which they arrive, not in document order.
      experimental: { disableOptimizedLoading: true },
    },
  })

  it('hydrates and navigates when the scripts arrive in reverse document order', async () => {
    // The document lists the scripts of `_app` before those of the page.
    const $ = await next.render$('/')
    const scripts = $('script[src]')
      .toArray()
      .map((script) => new URL(script.attribs.src, next.url).pathname)

    const errors: string[] = []
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        page.on('pageerror', (error) => errors.push(error.message))
        // Make the scripts arrive in reverse document order.
        await page.route('**/_next/static/**', async (route) => {
          const { pathname } = new URL(route.request().url())
          const index = scripts.lastIndexOf(pathname)
          if (index !== -1) {
            await new Promise((resolve) =>
              setTimeout(resolve, (scripts.length - 1 - index) * 100)
            )
          }
          await route.continue()
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#hydrated').text()).toBe('hydrated')
    })
    expect(await browser.eval('window.__instrumentationClientMarker')).toBe(
      MARKER
    )

    // A client navigation keeps the document.
    await browser.eval('window.__beforeNavigation = true')
    await browser.elementByCss('#to-other').click()
    await retry(async () => {
      expect(await browser.elementByCss('#other-marker').text()).toBe(MARKER)
    })
    expect(await browser.eval('window.__beforeNavigation')).toBe(true)
    expect(errors).toEqual([])
  })
})
