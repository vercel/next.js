import { nextTestSetup } from 'e2e-utils'

describe('next-dynamic-css', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should have correct order of styles between global and css modules', async () => {
    const browser = await next.browser('/page')
    expect(await browser.waitForElementByCss('#server').text()).toBe(
      'Hello Server'
    )

    expect(
      await browser.elementByCss('#server').getComputedCss('background-color')
    ).toBe('rgb(0, 128, 0)')
    expect(await browser.elementByCss('#server').getComputedCss('color')).toBe(
      'rgb(0, 0, 0)'
    )
  })

  if (isNextDev) {
    // TODO Fix order of styling in development
    it.todo(
      'should have correct order of styles on client component that is sharing styles with next/dynamic (TODO)'
    )
  } else {
    it('should have correct order of styles on client component that is sharing styles with next/dynamic', async () => {
      const browser = await next.browser('/page')
      expect(await browser.waitForElementByCss('#inner2').text()).toBe(
        'Hello Inner 2'
      )

      expect(
        await browser.elementByCss('#inner2').getComputedCss('background-color')
      ).toBe('rgb(0, 128, 0)')
      expect(
        await browser.elementByCss('#inner2').getComputedCss('color')
      ).toBe('rgb(0, 0, 0)')
    })
  }

  it('should have correct order of styles on next/dynamic loaded component', async () => {
    const browser = await next.browser('/page')
    expect(await browser.waitForElementByCss('#component').text()).toBe(
      'Hello Component'
    )

    expect(
      await browser
        .elementByCss('#component')
        .getComputedCss('background-color')
    ).toBe('rgb(0, 128, 0)')
    expect(
      await browser.elementByCss('#component').getComputedCss('color')
    ).toBe('rgb(0, 0, 0)')
  })

  it('should have correct order of global styles between layout and pages', async () => {
    const browser = await next.browser('/page')
    expect(await browser.waitForElementByCss('#global').text()).toBe(
      'Hello Global'
    )

    expect(
      await browser.elementByCss('#global').getComputedCss('background-color')
    ).toBe('rgba(0, 0, 0, 0)')
    expect(await browser.elementByCss('#global').getComputedCss('color')).toBe(
      'rgb(0, 0, 0)'
    )
    expect(
      await browser.elementByCss('body').getComputedCss('background-color')
    ).toBe('rgb(255, 255, 255)')
  })

  // Regression test for https://github.com/vercel/next.js/issues/98804
  // Nested next/dynamic: level-2 CSS must appear in SSR HTML
  it('should include nested next/dynamic CSS stylesheet links in SSR HTML', async () => {
    const html = await next.render('/nested')

    // Both level-1 (widget) and level-2 (variant) CSS should have
    // <link rel="stylesheet"> tags in the initial server-rendered HTML.
    // Count all stylesheet links with data-precedence="dynamic"
    const stylesheetLinks = html.match(
      /<link[^>]*rel="stylesheet"[^>]*data-precedence="dynamic"[^>]*>/g
    )

    // There should be at least 2 dynamic stylesheet links:
    // one for widget.module.css and one for variant.module.css
    expect(stylesheetLinks).toBeTruthy()
    expect(stylesheetLinks!.length).toBeGreaterThanOrEqual(2)
  })

  it('should apply nested next/dynamic CSS styles without FOUC', async () => {
    const browser = await next.browser('/nested')

    // Level-1 dynamic component (Widget) should have its CSS applied
    expect(
      await browser
        .waitForElementByCss('#widget')
        .getComputedCss('background-color')
    ).toBe('rgb(0, 128, 0)')

    // Level-2 dynamic component (Variant) should have its CSS applied
    expect(
      await browser
        .waitForElementByCss('#variant')
        .getComputedCss('background-color')
    ).toBe('rgb(0, 0, 255)')
  })
})
