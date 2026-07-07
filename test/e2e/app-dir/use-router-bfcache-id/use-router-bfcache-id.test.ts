import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('use-router-bfcache-id', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function setup(initialPath: string) {
    let page: Playwright.Page
    const browser = await next.browser(initialPath, {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)
    return { browser, act }
  }

  it('preserves leaf form state on browser back navigation', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="leaf-input"]').type('hello')

    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/x/2"]').click()
      await browser.elementByCss('a[href="/x/2"]').click()
    })

    await browser.back()
    expect(await browser.elementByCss('[data-testid="pathname"]').text()).toBe(
      '/x/1'
    )
    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('hello')
  })

  it('resets leaf form state when re-entering a route via fresh push', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="leaf-input"]').type('hello')

    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/x/2"]').click()
      await browser.elementByCss('a[href="/x/2"]').click()
    })

    // Navigate back to /x/1 via a fresh push (not the browser back button).
    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/x/1"]').click()
      await browser.elementByCss('a[href="/x/1"]').click()
    })

    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('')
  })

  it('preserves shared layout state across sibling leaf navigations', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="layout-input"]').type('layout')

    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/x/2"]').click()
      await browser.elementByCss('a[href="/x/2"]').click()
    })

    // The [group] layout is shared across /x/1 and /x/2, so its form state
    // survives the leaf navigation.
    expect(
      await browser.elementByCss('[data-testid="layout-input"]').getValue()
    ).toBe('layout')
  })

  it('resets shared layout state when navigating across groups', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="layout-input"]').type('layout')

    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/y/1"]').click()
      await browser.elementByCss('a[href="/y/1"]').click()
    })

    // /y/1 and /x/1 don't share the [group] layout — the form is mounted
    // fresh and its state is reset.
    expect(
      await browser.elementByCss('[data-testid="layout-input"]').getValue()
    ).toBe('')
  })

  it('preserves form state across search-param navigation', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="leaf-input"]').type('hello')

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/x/1?q=2"]')
        .click()
      await browser.elementByCss('a[href="/x/1?q=2"]').click()
    })

    expect(
      await browser.elementByCss('[data-testid="search"][data-value="q=2"]')
    ).toBeDefined()
    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('hello')
  })

  it('preserves form state across router.refresh()', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="leaf-input"]').type('hello')

    await act(async () => {
      await browser.elementByCss('[data-testid="refresh"]').click()
    })

    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('hello')
  })

  it('preserves form state when returning to a search-param URL via browser back', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="leaf-input"]').type('hello')

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/x/1?q=2"]')
        .click()
      await browser.elementByCss('a[href="/x/1?q=2"]').click()
    })

    expect(
      await browser.elementByCss('[data-testid="search"][data-value="q=2"]')
    ).toBeDefined()
    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('hello')

    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/x/2"]').click()
      await browser.elementByCss('a[href="/x/2"]').click()
    })

    await browser.back()
    expect(await browser.elementByCss('[data-testid="pathname"]').text()).toBe(
      '/x/1'
    )
    expect(
      await browser.elementByCss('[data-testid="search"][data-value="q=2"]')
    ).toBeDefined()
    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('hello')
  })

  it('preserves form state across a server action that calls refresh()', async () => {
    const { browser, act } = await setup('/x/1')
    await browser.elementByCss('[data-testid="leaf-input"]').type('hello')

    await act(async () => {
      await browser
        .elementByCss('[data-testid="server-action-refresh"]')
        .click()
    })

    expect(
      await browser.elementByCss('[data-testid="leaf-input"]').getValue()
    ).toBe('hello')
  })
})
