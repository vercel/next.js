import webdriver from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import { check, renderViaHTTP } from 'next-test-utils'

describe('basePath', () => {
  const basePath = '/docs'

  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath,
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
    },
  })

  describe('client-side navigation', () => {
    it('should navigate to /404 correctly client-side', async () => {
      const browser = await webdriver(next.url, `${basePath}/slug-1`)
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /slug-1/
      )

      await browser.eval('next.router.push("/404", "/slug-2")')
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /page could not be found/
      )
      expect(await browser.eval('location.pathname')).toBe(`${basePath}/slug-2`)
    })

    it('should navigate to /_error correctly client-side', async () => {
      const browser = await webdriver(next.url, `${basePath}/slug-1`)
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /slug-1/
      )

      await browser.eval('next.router.push("/_error", "/slug-2")')
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /page could not be found/
      )
      expect(await browser.eval('location.pathname')).toBe(`${basePath}/slug-2`)
    })
  })

  if (process.env.BROWSER_NAME === 'safari') {
    // currently only testing the above tests in safari
    // we can investigate testing more cases below if desired
    return
  }

  it('should not update URL for a 404', async () => {
    const browser = await webdriver(next.url, '/missing')

    if (isNextDeploy) {
      // the custom 404 only shows inside of the basePath so this
      // will be the Vercel default 404 page
      expect(
        await browser.eval('document.documentElement.innerHTML')
      ).toContain('NOT_FOUND')
    } else {
      const pathname = await browser.eval(() => window.location.pathname)
      expect(await browser.eval(() => (window as any).next.router.asPath)).toBe(
        '/missing'
      )
      expect(pathname).toBe('/missing')
    }
  })

  it('should handle 404 urls that start with basePath', async () => {
    const browser = await webdriver(next.url, `${basePath}hello`)

    if (isNextDeploy) {
      // the custom 404 only shows inside of the basePath so this
      // will be the Vercel default 404 page
      expect(
        await browser.eval('document.documentElement.innerHTML')
      ).toContain('404: This page could not be found')
    } else {
      expect(await browser.eval(() => (window as any).next.router.asPath)).toBe(
        `${basePath}hello`
      )
      expect(await browser.eval(() => window.location.pathname)).toBe(
        `${basePath}hello`
      )
    }
  })

  // TODO: this test has been passing incorrectly since the below check
  // wasn't being awaited. We need to investigate if this test is
  // correct or not.
  it.skip('should navigate back to a non-basepath 404 that starts with basepath', async () => {
    const browser = await webdriver(next.url, `${basePath}hello`)
    await browser.eval(() => ((window as any).navigationMarker = true))
    await browser.eval(() => (window as any).next.router.push('/hello'))
    await browser.waitForElementByCss('#pathname')
    await browser.back()
    await check(
      () => browser.eval(() => window.location.pathname),
      `${basePath}hello`
    )
    expect(await browser.eval(() => (window as any).next.router.asPath)).toBe(
      `${basePath}hello`
    )
    expect(await browser.eval(() => (window as any).navigationMarker)).toBe(
      true
    )
  })

  describe('manually added basePath in application logic', () => {
    it('should 404 when manually adding basePath with <Link>', async () => {
      const browser = await webdriver(
        next.url,
        `${basePath}/invalid-manual-basepath`
      )
      await browser.eval('window.beforeNav = "hi"')
      await browser.elementByCss('#other-page-link').click()

      await check(() => browser.eval('window.beforeNav'), {
        test(content) {
          return content !== 'hi'
        },
      })

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /This page could not be found/
      )
    })

    it('should 404 when manually adding basePath with router.push', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNav = "hi"')
      await browser.eval(`window.next.router.push("${basePath}/other-page")`)

      await check(() => browser.eval('window.beforeNav'), {
        test(content) {
          return content !== 'hi'
        },
      })

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('This page could not be found')
    })

    it('should 404 when manually adding basePath with router.replace', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNav = "hi"')
      await browser.eval(`window.next.router.replace("${basePath}/other-page")`)

      await check(() => browser.eval('window.beforeNav'), {
        test(content) {
          return content !== 'hi'
        },
      })

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('This page could not be found')
    })
  })

  it('should show 404 for page not under the /docs prefix', async () => {
    const text = await renderViaHTTP(next.url, '/hello')
    expect(text).not.toContain('Hello World')
    expect(text).toContain(
      isNextDeploy ? 'NOT_FOUND' : 'This page could not be found'
    )
  })
})
