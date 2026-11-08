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
