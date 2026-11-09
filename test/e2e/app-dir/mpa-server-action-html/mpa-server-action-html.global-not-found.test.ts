import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import type { Page } from 'playwright'
import { load } from 'cheerio'

describe('mpa-server-action-html with global-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.ts': new FileRef(
        join(__dirname, 'fixtures/global-next.config.ts')
      ),
      'app/global-not-found.tsx': new FileRef(
        join(__dirname, 'fixtures/global-not-found.tsx')
      ),
    },
  })

  it('renders a complete global not-found document after an MPA form submission', async () => {
    let page: Page
    const browser = await next.browser('/', {
      disableJavaScript: true,
      beforePageLoad(value: Page) {
        page = value
      },
    })
    const pendingResponse = page!.waitForResponse(
      (response) => response.request().method() === 'POST'
    )
    await browser.elementById('submit-not-found').click()
    const response = await pendingResponse
    expect(response.status()).toBe(404)
    const html = await response.text()
    expect(html).toMatch(/<!doctype html>/i)
    expect(html).toMatch(/<html[\s>]/i)
    expect(html).toMatch(/<body[\s>]/i)
    expect(html).toEndWith('</html>')
    const $ = load(html)
    expect($('#global-not-found-message').text()).toBe(
      'Global MPA action not found'
    )
  })
})
