import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, check, getRedboxSource } from 'next-test-utils'

describe('app-dir root layout', () => {
  const {
    next,
    isNextDev: isDev,
    skipped,
  } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isDev) {
    // TODO-APP: re-enable after reworking the error overlay.
    describe.skip('Missing required tags', () => {
      it('should error on page load', async () => {
        const browser = await next.browser('/missing-tags', {
          waitHydration: false,
        })

        await assertHasRedbox(browser)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "Please make sure to include the following tags in your root layout: <html>, <body>.

        Missing required root layout tags: html, body"
      `)
      })

      it('should error on page navigation', async () => {
        const browser = await next.browser('/has-tags', {
          waitHydration: false,
        })
        await browser.elementByCss('a').click()

        await assertHasRedbox(browser)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "Please make sure to include the following tags in your root layout: <html>, <body>.

        Missing required root layout tags: html, body"
      `)
      })

      it('should error on page load on static generation', async () => {
        const browser = await next.browser('/static-missing-tags/slug', {
          waitHydration: false,
        })

        await assertHasRedbox(browser)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "Please make sure to include the following tags in your root layout: <html>, <body>.

        Missing required root layout tags: html, body"
      `)
      })
    })
  }

  describe('Should do a mpa navigation when switching root layout', () => {
    it('should work with basic routes', async () => {
      const browser = await next.browser('/basic-route')

      expect(await browser.elementById('basic-route').text()).toBe(
        'Basic route'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#inner-basic-route').text()
      ).toBe('Inner basic route')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#route-group').text()).toBe(
        'Route group'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with route groups', async () => {
      const browser = await next.browser('/route-group')

      expect(await browser.elementById('route-group').text()).toBe(
        'Route group'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#nested-route-group').text()
      ).toBe('Nested route group')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#parallel-one').text()).toBe(
        'One'
      )
      expect(await browser.waitForElementByCss('#parallel-two').text()).toBe(
        'Two'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with parallel routes', async () => {
      const browser = await next.browser('/with-parallel-routes')

      expect(await browser.elementById('parallel-one').text()).toBe('One')
      expect(await browser.elementById('parallel-two').text()).toBe('Two')
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await check(async () => {
        await browser.elementByCss('a').click()
        expect(
          await browser.waitForElementByCss('#parallel-one-inner').text()
        ).toBe('One inner')
        expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()
        return 'success'
      }, 'success')

      // Navigate to page with different root layout
      await check(async () => {
        await browser.elementByCss('a').click()
        expect(await browser.waitForElementByCss('#dynamic-hello').text()).toBe(
          'dynamic hello'
        )
        return 'success'
      }, 'success')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with dynamic routes', async () => {
      const browser = await next.browser('/dynamic/first')

      expect(await browser.elementById('dynamic-first').text()).toBe(
        'dynamic first'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#dynamic-first-second').text()
      ).toBe('dynamic first second')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#inner-basic-route').text()
      ).toBe('Inner basic route')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with dynamic catchall routes', async () => {
      const browser = await next.browser('/dynamic-catchall/slug')

      expect(await browser.elementById('catchall-slug').text()).toBe(
        'catchall slug'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementById('to-next-url').click()
      expect(
        await browser.waitForElementByCss('#catchall-slug-slug').text()
      ).toBe('catchall slug slug')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementById('to-dynamic-first').click()
      expect(await browser.elementById('dynamic-first').text()).toBe(
        'dynamic first'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with static routes', async () => {
      const browser = await next.browser('/static-mpa-navigation/slug1')

      expect(await browser.elementById('static-slug1').text()).toBe(
        'static slug1'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#static-slug2').text()).toBe(
        'static slug2'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.elementById('basic-route').text()).toBe(
        'Basic route'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()

      const res = await next.fetch(
        `${next.url}/static-mpa-navigation/slug-not-existed`
      )
      expect(res.status).toBe(404)
    })
  })

  it('should correctly handle navigation between multiple root layouts', async () => {
    const browser = await next.browser('/root-layout-a')

    await browser.waitForElementByCss('#root-a')
    expect(await browser.hasElementByCssSelector('#root-b')).toBeFalse()
    await browser
      .elementById('link-to-b')
      .click()
      .waitForElementByCss('#root-b')
    expect(await browser.hasElementByCssSelector('#root-a')).toBeFalse()
  })

  it('should correctly handle navigation between multiple root layouts when redirecting in a server action', async () => {
    const browser = await next.browser('/root-layout-a')

    await browser.waitForElementByCss('#action-redirect-to-b')
    expect(await browser.hasElementByCssSelector('#root-b')).toBeFalse()
    await browser
      .elementById('action-redirect-to-b')
      .click()
      .waitForElementByCss('#root-b')
    expect(await browser.hasElementByCssSelector('#root-a')).toBeFalse()
  })
})
