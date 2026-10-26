import { nextTestSetup } from 'e2e-utils'
import type { Page, Response } from 'playwright'
import { load } from 'cheerio'
import { retry } from 'next-test-utils'

describe('mpa-server-action-html', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function openPage(pathname = '/') {
    let page: Page
    const browser = await next.browser(pathname, {
      disableJavaScript: true,
      beforePageLoad(value: Page) {
        page = value
      },
    })
    return { browser, page: page! }
  }

  async function readDocument(response: Response, status = 200) {
    expect(response.status()).toBe(status)
    const html = await response.text()
    expect(html).toMatch(/<!doctype html>/i)
    expect(html).toMatch(/<html[\s>]/i)
    expect(html).toMatch(/<body[\s>]/i)
    expect(html).toEndWith('</html>')
    const $ = load(html)
    expect($('#static-shell').text()).toBe('MPA action page')
    return $
  }

  it('returns a complete document after a plain action with bound arguments', async () => {
    const { browser, page } = await openPage()
    const pendingResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST'
    )
    await browser.elementById('submit-plain').click()
    const $ = await readDocument(await pendingResponse)
    expect($('#submitted-message').text()).toBe('bound:Ada')
  })

  it.each([
    ['/', 'static'],
    ['/dynamic-form', 'dynamic'],
    ['/data-only', 'data'],
    ['/blocking', 'blocking'],
  ])(
    'renders returned form state in a complete document on %s',
    async (pathname, name) => {
      const { page } = await openPage(pathname)
      for (const count of [1, 2]) {
        const [response] = await Promise.all([
          page.waitForResponse(
            (response) => response.request().method() === 'POST'
          ),
          page.locator(`#submit-${name}`).evaluate((button) => {
            button.closest('form')!.requestSubmit()
          }),
        ])
        const $ = await readDocument(response)
        expect($(`#state-${name}`).text()).toBe(`${count}:${name}:Ada`)
        expect(await page.locator(`#state-${name}`).textContent()).toBe(
          `${count}:${name}:Ada`
        )
      }
    }
  )

  it('returns a complete not-found document after an MPA form submission', async () => {
    const { browser, page } = await openPage()
    const pendingResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST'
    )
    await browser.elementById('submit-not-found').click()
    const $ = await readDocument(await pendingResponse, 404)
    expect($('#not-found-message').text()).toBe('MPA action not found')
  })

  // @force-gate !dev
  it('reuses prerendered cache values from the RDC after an MPA form submission', async () => {
    const { browser, page } = await openPage()
    const initialLayout = await browser.elementById('layout-value').text()
    const initialContent = await browser.elementById('content-value').text()
    const pendingResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST'
    )
    await browser.elementById('submit-static').click()
    const $ = await readDocument(await pendingResponse)
    expect($('#layout-value').text()).toBe(initialLayout)
    expect($('#content-value').text()).toBe(initialContent)
    expect($('#state-static').text()).toBe('1:static:Ada')
  })

  it('uses fresh invalidated data while preserving unrelated cached values', async () => {
    const { browser, page } = await openPage()
    const initialLayout = await browser.elementById('layout-value').text()
    const initialContent = await browser.elementById('content-value').text()
    const pendingResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST'
    )
    await browser.elementById('submit-invalidate').click()
    const $ = await readDocument(await pendingResponse)
    expect($('#content-value').text()).not.toBe(initialContent)
    expect($('#layout-value').text()).toBe(initialLayout)
    expect($('#state-invalidate').text()).toBe('1:invalidate:Ada')
  })

  it('preserves form state through an MPA form submission, hydration, and a fetch action', async () => {
    let page: Page
    let releaseScripts: () => void
    let notifyBlockedScript: () => void
    let scriptsReleased = false
    const scriptsReady = new Promise<void>((resolve) => {
      releaseScripts = resolve
    })
    const scriptBlocked = new Promise<void>((resolve) => {
      notifyBlockedScript = resolve
    })
    const browser = await next.browser('/', {
      waitHydration: false,
      waitUntil: 'commit',
      async beforePageLoad(value: Page) {
        page = value
        await page.route('**/_next/**/*.js*', async (route) => {
          if (!scriptsReleased) {
            notifyBlockedScript!()
            await scriptsReady
          }
          await route.continue().catch(() => {})
        })
      },
    })
    try {
      await page!.locator('#submit-static').waitFor({ state: 'visible' })
      await scriptBlocked
      const pendingResponse = page!.waitForResponse(
        (response) => response.request().method() === 'POST'
      )
      await page!.locator('#submit-static').click({ noWaitAfter: true })
      const response = await pendingResponse
      expect(response.request().headers()['next-action']).toBeUndefined()
      const $ = await readDocument(response)
      expect($('#state-static').text()).toBe('1:static:Ada')
      scriptsReleased = true
      releaseScripts!()
      await browser.waitForElementByCss('#hydrated-static')
      expect(await browser.elementById('state-static').text()).toBe(
        '1:static:Ada'
      )
      const pendingFetch = page!.waitForResponse(
        (response) => response.request().method() === 'POST'
      )
      await browser.elementById('submit-static').click()
      const fetchResponse = await pendingFetch
      expect(fetchResponse.request().headers()['next-action']).toEqual(
        expect.any(String)
      )
      expect(fetchResponse.headers()['content-type']).toContain(
        'text/x-component'
      )
      await retry(async () => {
        expect(await browser.elementById('state-static').text()).toBe(
          '2:static:Ada'
        )
      })
    } finally {
      scriptsReleased = true
      releaseScripts!()
    }
  })
})
