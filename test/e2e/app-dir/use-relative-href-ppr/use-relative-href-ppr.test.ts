import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

// With cacheComponents, routes with dynamic params get a params-agnostic
// fallback shell at build time. unstable_useRelativeHref results that are
// invariant to the unknown param values are prerendered into the shell;
// results that depend on them deopt to dynamic holes (each link in the
// fixture has its own Suspense boundary) and are filled in at request time.
describe('unstable_useRelativeHref - cacheComponents fallback shells', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  function relativeHrefLink(
    browser: Playwright,
    wrapperId: string,
    target: string
  ) {
    return browser.elementByCss(`#${wrapperId} [data-target="${target}"]`)
  }

  async function getRelativeHref(
    browser: Playwright,
    wrapperId: string,
    target: string
  ): Promise<string> {
    return relativeHrefLink(browser, wrapperId, target).text()
  }

  it('resolves hrefs with the actual param value at request time', async () => {
    const browser = await next.browser('/en/settings')
    expect(
      await getRelativeHref(browser, 'lang-settings-hrefs', '/[lang]/profile')
    ).toBe('./profile/')
    expect(
      await getRelativeHref(browser, 'lang-settings-hrefs', '/[lang]/settings')
    ).toBe('./settings/')
    expect(await getRelativeHref(browser, 'lang-settings-hrefs', '/')).toBe(
      '../'
    )
    // The concrete 'en' matches the actual param value, so the shared prefix
    // includes it and the result is the short form.
    await retry(async () => {
      expect(
        await getRelativeHref(browser, 'lang-settings-hrefs', '/en/profile')
      ).toBe('./profile/')
    })

    await relativeHrefLink(
      browser,
      'lang-settings-hrefs',
      '/[lang]/profile'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/en/profile')
      expect(await browser.elementByCss('#lang-profile-page').text()).toBe(
        'Profile'
      )
    })
  })

  it('resolves a concrete target that diverges from the actual param value', async () => {
    const browser = await next.browser('/fr/settings')
    // 'en' does not match the actual param value 'fr', so the target is
    // spelled out from the divergence point.
    await retry(async () => {
      expect(
        await getRelativeHref(browser, 'lang-settings-hrefs', '/en/profile')
      ).toBe('../en/profile/')
    })

    await relativeHrefLink(
      browser,
      'lang-settings-hrefs',
      '/en/profile'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/en/profile')
      expect(await browser.elementByCss('#lang-profile-page').text()).toBe(
        'Profile'
      )
    })
  })

  it('resolves value-dependent hrefs at request time', async () => {
    const browser = await next.browser('/deopt/123')
    expect(await getRelativeHref(browser, 'deopt-page-hrefs', '/deopt')).toBe(
      './'
    )
    // Own route and descendant respell the [id] value, which only exists at
    // request time.
    await retry(async () => {
      expect(
        await getRelativeHref(browser, 'deopt-page-hrefs', '/deopt/[id]')
      ).toBe('./123/')
      expect(
        await getRelativeHref(browser, 'deopt-page-hrefs', '/deopt/[id]/edit')
      ).toBe('./123/edit/')
    })

    await relativeHrefLink(
      browser,
      'deopt-page-hrefs',
      '/deopt/[id]/edit'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/deopt/123/edit'
      )
      expect(await browser.elementByCss('#deopt-edit-page').text()).toBe('Edit')
    })
  })

  it('resolves hrefs from the actual URL at request time on a catch-all route', async () => {
    // /blog/[...slug] has no statically resolvable path, so root-relative
    // targets resolve against the actual URL pathname, whose depth is a
    // per-request value.
    const browser = await next.browser('/blog/a/b')
    await retry(async () => {
      expect(await getRelativeHref(browser, 'blog-page-hrefs', '/blog')).toBe(
        '../'
      )
      expect(await getRelativeHref(browser, 'blog-page-hrefs', '/')).toBe(
        '../../'
      )
    })
    expect(
      await getRelativeHref(
        browser,
        'blog-page-hrefs',
        'https://example.com/docs'
      )
    ).toBe('https://example.com/docs')
  })

  it('clicking a shell-resolved ancestor link navigates correctly', async () => {
    const browser = await next.browser('/deopt/123')
    await relativeHrefLink(browser, 'deopt-page-hrefs', '/deopt').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/deopt')
      expect(await browser.elementByCss('#deopt-index-page').text()).toBe(
        'Deopt index'
      )
    })
  })

  if (isNextStart) {
    it('bakes value-invariant hrefs into the fallback shell and deopts value-dependent ones', async () => {
      const cheerio = require('cheerio')

      // The fallback shell of /[lang]/settings: hrefs that don't depend on
      // the [lang] value are prerendered; the '/en/profile' link (concrete
      // segment compared against the unknown value) is a dynamic hole,
      // represented by its Suspense fallback.
      const settingsShell = cheerio.load(
        await next.readFile('.next/server/app/[lang]/settings.html')
      )
      expect(settingsShell('a[data-target="/[lang]/profile"]').text()).toBe(
        './profile/'
      )
      expect(settingsShell('a[data-target="/[lang]/settings"]').text()).toBe(
        './settings/'
      )
      expect(settingsShell('a[data-target="/"]').text()).toBe('../')
      // A non-root-relative target is returned verbatim and never depends
      // on route values, so it's always part of the shell.
      expect(
        settingsShell('a[data-target="https://example.com/docs"]').text()
      ).toBe('https://example.com/docs')
      expect(settingsShell('a[data-target="/en/profile"]').length).toBe(0)
      expect(
        settingsShell('.relative-href-fallback[data-target="/en/profile"]')
          .length
      ).toBe(1)

      // The fallback shell of /deopt/[id]: the pure-traversal '/deopt' link
      // is prerendered; the own-route and descendant links need the [id]
      // value respelled into the href, so both are dynamic holes.
      const deoptShell = cheerio.load(
        await next.readFile('.next/server/app/deopt/[id].html')
      )
      expect(deoptShell('a[data-target="/deopt"]').text()).toBe('./')
      expect(deoptShell('a[data-target="/deopt/[id]"]').length).toBe(0)
      expect(deoptShell('a[data-target="/deopt/[id]/edit"]').length).toBe(0)
      expect(
        deoptShell('.relative-href-fallback[data-target="/deopt/[id]"]').length
      ).toBe(1)
      expect(
        deoptShell('.relative-href-fallback[data-target="/deopt/[id]/edit"]')
          .length
      ).toBe(1)

      // The fallback shell of /blog/[...slug]: the route has no statically
      // resolvable path, so hrefs resolve against the URL pathname — a
      // placeholder during this prerender. Every root-relative target is a
      // dynamic hole (even pure-traversal ones: the traversal depth is a
      // per-request value); only the non-route target, which never reads
      // the base, is prerendered.
      const blogShell = cheerio.load(
        await next.readFile('.next/server/app/blog/[...slug].html')
      )
      expect(
        blogShell('a[data-target="https://example.com/docs"]').text()
      ).toBe('https://example.com/docs')
      expect(blogShell('a[data-target="/blog"]').length).toBe(0)
      expect(blogShell('a[data-target="/"]').length).toBe(0)
      expect(
        blogShell('.relative-href-fallback[data-target="/blog"]').length
      ).toBe(1)
      expect(blogShell('.relative-href-fallback[data-target="/"]').length).toBe(
        1
      )
    })
  }
})
