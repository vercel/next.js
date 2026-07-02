import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('discarded action settling while a navigation is pending (#86151)', () => {
  const { next } = nextTestSetup({ files: __dirname })

  // Navigating while a server action is in flight discards that action:
  // its result is never applied. These tests cover the window where the
  // discarded action's response arrives while the navigation is still
  // ongoing. The navigation must not be reverted, and later actions must
  // not run until it finishes — if one ran earlier, it would see the
  // pre-navigation page and undo the navigation.
  async function interleave(
    dispatchButton: string,
    options?: { allowErrorStatusCodes: number[] }
  ) {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, options)

    // data-render counts how many times the client received new data for
    // the root layout. Navigations preserve the root layout, so it only
    // changes when the router refreshes.
    const initialRender = await browser
      .elementById('stamp')
      .getAttribute('data-render')

    await act(
      async () => {
        // Start server action A. Its response is withheld, so it stays in
        // flight throughout this scope.
        await act(async () => {
          await browser.elementById(dispatchButton).click()
        }, 'block')

        // Start server action B. Actions run one at a time, so B waits for
        // A and no request is issued yet.
        await act(async () => {
          await browser.elementById('dispatch-b').click()
        }, 'no-requests')

        // Navigate before A or B finished. This discards A. The navigation
        // response is withheld too, so the navigation is still ongoing when
        // A's response arrives below.
        await act(
          async () => {
            await browser.elementById('go-dest').click()
          },
          { includes: 'Destination page', block: true }
        )

        // Exiting this scope delivers the withheld responses in the same
        // order: first A's, mid-navigation — the moment under test — then
        // the navigation's. Only then may B run.
      },
      // B ran and completed.
      { includes: 'b-result' }
    )

    // B completing means all three operations have settled.
    await browser.waitForElementByCss('#status-b[data-status="b-result"]')

    // If B ran too early, it saw the pre-navigation page — but that is not
    // necessarily visible yet. Running one more action makes it visible:
    // with the bug, the URL flips back to "/" here instead of staying
    // on /dest.
    await act(
      async () => {
        await browser.elementById('dispatch-c').click()
      },
      { includes: 'c-result' }
    )
    await browser.waitForElementByCss('#status-c[data-status="c-result"]')

    expect(new URL(await browser.url()).pathname).toBe('/dest')
    expect(await browser.elementById('dest').text()).toBe('Destination page')

    return { browser, initialRender }
  }

  it('keeps the navigation when the discarded action resolves', async () => {
    const { browser, initialRender } = await interleave('dispatch-resolve')

    // The discarded action didn't revalidate anything, so there must be
    // no refresh.
    expect(await browser.elementById('stamp').getAttribute('data-render')).toBe(
      initialRender
    )
  })

  // Same scenario, but the discarded action fails. Failure is handled
  // separately from success, so cover both.
  it('keeps the navigation when the discarded action rejects', async () => {
    const { browser, initialRender } = await interleave('dispatch-reject', {
      // A server action that throws responds with a 500.
      allowErrorStatusCodes: [500],
    })

    await browser.waitForElementByCss('#status-a[data-status="rejected"]')
    expect(await browser.elementById('stamp').getAttribute('data-render')).toBe(
      initialRender
    )
  })

  // An action can also be dispatched *while* the navigation is ongoing.
  // It must run once the navigation finishes. (At one point it never ran:
  // its caller never settled, and the router stopped applying updates
  // entirely — the URL never even changed to the navigation target.)
  it('runs an action dispatched during the navigation once it finishes', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    await act(
      async () => {
        // Start server action A. Its response is withheld, so it stays in
        // flight throughout this scope.
        await act(async () => {
          await browser.elementById('dispatch-resolve').click()
        }, 'block')

        // Navigate before A finished. This discards A. The navigation
        // response is withheld too, so the navigation is still ongoing
        // when B is dispatched below.
        await act(
          async () => {
            await browser.elementById('go-dest').click()
          },
          { includes: 'Destination page', block: true }
        )

        // Dispatch server action B while the navigation is ongoing. It
        // must wait for the navigation, so no request is issued yet.
        await act(async () => {
          await browser.elementById('dispatch-b').click()
        }, 'no-requests')
      },
      // B ran once the withheld responses were delivered.
      { includes: 'b-result' }
    )

    await browser.waitForElementByCss('#status-b[data-status="b-result"]')
    expect(new URL(await browser.url()).pathname).toBe('/dest')
    expect(await browser.elementById('dest').text()).toBe('Destination page')
  })

  it('defers the refresh from a discarded revalidating action until the queue drains', async () => {
    const { browser, initialRender } = await interleave('dispatch-revalidate')

    // The discarded action revalidated, so a refresh must still happen —
    // after everything else, and without undoing the navigation.
    await browser.waitForElementByCss(
      `#stamp:not([data-render="${initialRender}"])`
    )
    expect(new URL(await browser.url()).pathname).toBe('/dest')
    expect(await browser.elementById('dest').text()).toBe('Destination page')
  })
})
