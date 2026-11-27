import { nextTestSetup } from 'e2e-utils'

describe('next-dynamic-css', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
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

  // Webpack-only: Turbopack doesn't load chunk CSS through the app router's
  // runtime stylesheet list. Dev has the ordering TODO above.
  if (!isNextDev && !isTurbopack) {
    it('should have correct order of styles when next/dynamic CSS is registered before the first commit', async () => {
      // Hold the page's client chunk until the next/dynamic chunk has loaded.
      // The dynamic component's CSS is then always registered before the app
      // router's first commit, a timing that otherwise only happens under load.
      let releasePageChunk: () => void
      const dynamicChunkLoaded = new Promise<void>((resolve) => {
        releasePageChunk = resolve
      })
      const browser = await next.browser('/page', {
        async beforePageLoad(page) {
          page.on('requestfinished', (request) => {
            if (
              request
                .url()
                .includes('/_next/static/chunks/next-dynamic-css-component.')
            ) {
              releasePageChunk()
            }
          })
          await page.route(
            /\/_next\/static\/chunks\/app\/page\/page-[^/]*\.js/,
            async (route) => {
              await dynamicChunkLoaded
              await route.continue()
            }
          )
        },
      })
      expect(await browser.waitForElementByCss('#component').text()).toBe(
        'Hello Component'
      )

      expect(
        await browser.elementByCss('#inner2').getComputedCss('color')
      ).toBe('rgb(0, 0, 0)')
      expect(
        await browser
          .elementByCss('#component')
          .getComputedCss('background-color')
      ).toBe('rgb(0, 128, 0)')
    })
  }

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
})
