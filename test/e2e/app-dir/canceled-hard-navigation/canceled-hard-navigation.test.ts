import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

describe('canceled-hard-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function trackDocumentResponses(page: Page, statuses: number[]) {
    page.on('response', (response) => {
      const request = response.request()
      if (
        request.resourceType() === 'document' &&
        new URL(request.url()).pathname === '/b'
      ) {
        statuses.push(response.status())
      }
    })
  }

  it('can retry a hard navigation after the browser drops a 204 response', async () => {
    const statuses: number[] = []
    const browser = await next.browser('/a', {
      beforePageLoad(page: Page) {
        trackDocumentResponses(page, statuses)
      },
    })

    await browser.eval(
      `document.cookie = 'cancel-document-request=1; path=/'; window.__documentMarker = true`
    )
    await browser.elementByCss('#to-b').click()

    // The browser received the 204 and kept the current document.
    await retry(async () => {
      expect(statuses).toEqual([204])
    })
    expect(await browser.elementByCss('#page-a').text()).toBe('Page A')
    expect(await browser.eval('window.__documentMarker')).toBe(true)

    // Clicking the link again must start a new document request.
    await browser.eval(
      `document.cookie = 'cancel-document-request=; max-age=0; path=/'`
    )
    await browser.elementByCss('#to-b').click()

    await retry(async () => {
      expect(await browser.elementByCss('#page-b').text()).toBe('Page B')
    })
    expect(statuses).toEqual([204, 200])
  })

  it('can retry a hard navigation after beforeunload cancels it', async () => {
    const statuses: number[] = []
    const dialogs: string[] = []
    const browser = await next.browser('/a', {
      beforePageLoad(page: Page) {
        trackDocumentResponses(page, statuses)
        page.on('dialog', (dialog) => {
          dialogs.push(dialog.type())
          // Stay on the page.
          dialog.dismiss()
        })
      },
    })

    await browser.eval(`window.__documentMarker = true`)
    await browser.elementByCss('#toggle-before-unload').click()
    expect(await browser.elementByCss('#toggle-before-unload').text()).toBe(
      'Allow unload'
    )
    await browser.elementByCss('#to-b').click()

    await retry(async () => {
      expect(dialogs).toEqual(['beforeunload'])
    })
    expect(statuses).toEqual([])
    expect(await browser.elementByCss('#page-a').text()).toBe('Page A')
    expect(await browser.eval('window.__documentMarker')).toBe(true)

    // Clicking the link again must start a new document navigation.
    await browser.elementByCss('#toggle-before-unload').click()
    expect(await browser.elementByCss('#toggle-before-unload').text()).toBe(
      'Block unload'
    )
    await browser.elementByCss('#to-b').click()

    await retry(async () => {
      expect(await browser.elementByCss('#page-b').text()).toBe('Page B')
    })
    expect(statuses).toEqual([200])
  })
})
