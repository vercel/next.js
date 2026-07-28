import { isReact18, nextTestSetup } from 'e2e-utils'

describe('browser-only', () => {
  const { next, isNextDeploy } = nextTestSetup({
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
  if (!isReact18) {
    it('renders static Pages Router boundaries without reporting bailout errors', async () => {
      const $ = await next.render$('/browser-only')
      expect($('#pages-server-sibling').text()).toBe('pages server sibling')
      expect($('#pages-fallback').text()).toBe('pages fallback')
      expect($('#pages-second-fallback').text()).toBe('pages second fallback')
      expect($('#pages-browser-content').length).toBe(0)
      expect($('#pages-second-browser-content').length).toBe(0)
      expect($('#pages-error-fallback').length).toBe(0)

      const browser = await next.browser('/browser-only', {
        pushErrorAsConsoleLog: true,
      })
      expect(await browser.elementByCss('#pages-browser-content').text()).toBe(
        'pages browser content'
      )
      expect(
        await browser.elementByCss('#pages-second-browser-content').text()
      ).toBe('pages second browser content')
      expect(
        await browser.hasElementByCssSelector('#pages-error-fallback')
      ).toBe(false)

      const logs = await browser.log()
      expect(logs.filter((entry) => entry.source === 'error')).toEqual([])
      expect(
        next.cliOutput.includes(
          'Bail out to client-side rendering: browserOnly()'
        )
      ).toBe(false)
    })

    it('renders a request-time Pages Router boundary without reporting bailout errors', async () => {
      const $ = await next.render$('/browser-only-ssr')
      expect($('#pages-ssr-server-sibling').text()).toBe(
        'pages SSR server sibling'
      )
      expect($('#pages-ssr-fallback').text()).toBe('pages SSR fallback')
      expect($('#pages-ssr-browser-content').length).toBe(0)

      const browser = await next.browser('/browser-only-ssr', {
        pushErrorAsConsoleLog: true,
      })
      expect(
        await browser.elementByCss('#pages-ssr-browser-content').text()
      ).toBe('pages SSR browser content')

      const logs = await browser.log()
      expect(logs.filter((entry) => entry.source === 'error')).toEqual([])
      if (!isNextDeploy) {
        expect(
          next.cliOutput.includes(
            'Bail out to client-side rendering: browserOnly()'
          )
        ).toBe(false)
      }
    })
  } else {
    it('reports that Pages Router usage requires React 19', async () => {
      await next.render$('/browser-only')

      expect(next.cliOutput).toContain(
        '`browserOnly()` requires React 19 or later.'
      )
    })
  }

  // Skip in deploy because `next.cliOutput` only contains build logs there,
  // not runtime logs from the request below.
  if (!isNextDeploy) {
    it('continues reporting non-bailout Pages Router render errors', async () => {
      const outputIndex = next.cliOutput.length
      const $ = await next.render$('/server-render-error')
      expect($('#server-error-fallback').text()).toBe('error fallback')
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'expected Pages Router server render error'
      )
    })
  }
})
