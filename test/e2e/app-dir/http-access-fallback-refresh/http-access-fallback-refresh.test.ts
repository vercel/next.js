import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('HTTP access fallback refresh', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('resets a not-found boundary when the same route is refreshed', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await browser.waitForElementByCss('#home')

    await browser.elementById('layout-state').type('preserved')
    await browser.eval(`window.__httpAccessFallbackDocument = 'preserved'`)

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/protected"]')
        .click()
      await browser.elementByCss('a[href="/protected"]').click()
    })
    await retry(async () => {
      expect(await browser.hasElementByCss('#access-not-found')).toBe(true)
    })
    const protectedUrl = await browser.url()

    await browser.elementById('fallback-state').type('preserved')
    async function readFallbackMountId() {
      let mountId = ''
      await retry(async () => {
        mountId = await browser.elementById('fallback-mount-id').text()
        expect(mountId).not.toBe('')
      })
      return mountId
    }

    const initialFallbackMountId = await readFallbackMountId()

    async function expectDocumentStateToBePreserved() {
      expect(await browser.url()).toBe(protectedUrl)
      expect(await browser.elementById('layout-state').getValue()).toBe(
        'preserved'
      )
      expect(await browser.eval(`window.__httpAccessFallbackDocument`)).toBe(
        'preserved'
      )
    }

    await expectDocumentStateToBePreserved()

    await act(
      async () => {
        await browser.elementById('refresh-not-found').click()
      },
      { includes: 'Access not found' }
    )
    await retry(async () => {
      expect(await browser.hasElementByCss('#access-not-found')).toBe(true)
    })
    const retriedFallbackMountId = await readFallbackMountId()
    // Retrying a boundary that still throws replaces its fallback subtree once.
    // It must then settle without replacing the document/layout or continuing
    // to remount the fallback.
    expect(retriedFallbackMountId).not.toBe(initialFallbackMountId)
    expect(await browser.elementById('fallback-state').getValue()).toBe('')
    await retry(async () => {
      expect(
        await browser.eval(
          `document.getElementById('refresh-not-found').disabled`
        )
      ).toBe(false)
    })
    for (let i = 0; i < 3; i++) {
      await browser.eval(`new Promise(requestAnimationFrame)`)
      expect(await browser.elementById('fallback-mount-id').text()).toBe(
        retriedFallbackMountId
      )
    }
    await expectDocumentStateToBePreserved()

    await act(
      async () => {
        await browser.elementById('grant-access').click()
      },
      { includes: 'Protected content' }
    )
    await retry(async () => {
      expect(await browser.hasElementByCss('#protected-content')).toBe(true)
    })
    await expectDocumentStateToBePreserved()

    await act(async () => {
      await browser.elementById('revoke-access').click()
    })
    await retry(async () => {
      expect(await browser.hasElementByCss('#access-not-found')).toBe(true)
    })
    await expectDocumentStateToBePreserved()

    await act(
      async () => {
        await browser.elementById('grant-access').click()
      },
      { includes: 'Protected content' }
    )
    await retry(async () => {
      expect(await browser.hasElementByCss('#protected-content')).toBe(true)
    })
    await expectDocumentStateToBePreserved()
  })

  it('resets a not-found boundary after a search parameter change', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await browser.waitForElementByCss('#home')

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/blog?category=invalid"]')
        .click()
      await browser.elementByCss('a[href="/blog?category=invalid"]').click()
    })
    await retry(async () => {
      expect(await browser.hasElementByCss('#blog-not-found')).toBe(true)
    })

    await act(
      async () => {
        await browser.elementByCss('input[data-link-accordion="/blog"]').click()
        await browser.elementByCss('a[href="/blog"]').click()
      },
      { includes: 'All posts' }
    )
    await retry(async () => {
      expect(await browser.hasElementByCss('#blog-content')).toBe(true)
    })
    expect(new URL(await browser.url()).search).toBe('')
  })
})
