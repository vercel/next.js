import { nextTestSetup } from 'e2e-utils'

describe('browser-only', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders a static fallback on the server and content after hydration', async () => {
    const $ = await next.render$('/')
    expect($('#server-sibling').text()).toBe('static server sibling')
    expect($('#fallback').text()).toBe('static fallback')
    expect($('#browser-content').length).toBe(0)
    expect($('#app-error-fallback').length).toBe(0)

    const browser = await next.browser('/')
    expect(await browser.elementByCss('#browser-content').text()).toBe(
      'static browser content'
    )
    expect(await browser.hasElementByCssSelector('#app-error-fallback')).toBe(
      false
    )
  })

  it('renders a dynamic SSR fallback on the server and content after hydration', async () => {
    const $ = await next.render$('/dynamic')
    expect($('#dynamic-server-sibling').text()).toBe('dynamic server sibling')
    expect($('#dynamic-fallback').text()).toBe('dynamic fallback')
    expect($('#dynamic-browser-content').length).toBe(0)

    const browser = await next.browser('/dynamic')
    expect(await browser.elementByCss('#dynamic-browser-content').text()).toBe(
      'dynamic browser content'
    )
  })

  it('keeps server siblings while a nested boundary bails out', async () => {
    const $ = await next.render$('/nested')
    expect($('#outer-server-sibling').text()).toBe('outer server sibling')
    expect($('#inner-server-sibling').text()).toBe('inner server sibling')
    expect($('#inner-fallback').text()).toBe('inner fallback')
    expect($('#outer-fallback').length).toBe(0)
    expect($('#nested-browser-content').length).toBe(0)

    const browser = await next.browser('/nested')
    expect(await browser.elementByCss('#nested-browser-content').text()).toBe(
      'nested browser content'
    )
  })

  it('supports repeated calls and rerenders without uncached promise warnings', async () => {
    const browser = await next.browser('/rerender', {
      pushErrorAsConsoleLog: true,
    })

    expect(await browser.elementByCss('#render-count').text()).toBe('0')
    expect(await browser.elementByCss('#first-value').text()).toBe('ready')
    expect(await browser.elementByCss('#second-value').text()).toBe('ready')

    await browser.elementByCss('#rerender').click()
    expect(await browser.elementByCss('#render-count').text()).toBe('1')

    const logs = await browser.log()
    expect(
      logs.filter(
        (entry) =>
          entry.source === 'error' || entry.message.includes('uncached promise')
      ).length
    ).toBe(0)
  })

  it('works during a client navigation without a hard reload', async () => {
    const browser = await next.browser('/navigation')
    await browser.eval('window.__browserOnlyNavigationMarker = true')

    await browser.elementByCss('#to-target').click()

    expect(await browser.elementByCss('#target-browser-content').text()).toBe(
      'target browser content'
    )
    expect(
      await browser.eval('window.__browserOnlyNavigationMarker === true')
    ).toBe(true)
  })
})
