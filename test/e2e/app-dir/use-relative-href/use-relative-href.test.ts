import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('unstable_useRelativeHref', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Each target rendered by the RelativeHrefs fixture component is a <Link>
  // whose href is the raw hook result and whose text content is the same
  // string, so tests can assert the exact relative form and then click the
  // link to demonstrate it resolves to the correct route.
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

  it('returns "./" for the root route on the root page, and clicking it stays on the root', async () => {
    const browser = await next.browser('/')
    expect(await getRelativeHref(browser, 'home-page-hrefs', '/')).toBe('./')

    await relativeHrefLink(browser, 'home-page-hrefs', '/').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/')
      expect(await browser.elementByCss('#home-page').text()).toBe('Home')
    })
  })

  it('ignores route groups when computing traversal depth', async () => {
    // /about is rendered by app/(group)/about/page.tsx; the route group does
    // not contribute a URL segment, so '/' is the page's parent and clicking
    // the link lands on the root page.
    const browser = await next.browser('/about')
    expect(await getRelativeHref(browser, 'about-page-hrefs', '/')).toBe('./')

    await relativeHrefLink(browser, 'about-page-hrefs', '/').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/')
      expect(await browser.elementByCss('#home-page').text()).toBe('Home')
    })
  })

  it('resolves targets relative to a page with a dynamic segment', async () => {
    const browser = await next.browser('/chat/123')
    // Ancestors: pure traversal, no param values.
    expect(await getRelativeHref(browser, 'chat-page-hrefs', '/chat')).toBe(
      './'
    )
    expect(await getRelativeHref(browser, 'chat-page-hrefs', '/')).toBe('../')
    // Own route: the final segment is spelled back out.
    expect(
      await getRelativeHref(browser, 'chat-page-hrefs', '/chat/[id]')
    ).toBe('./123/')
    // Descendant of the current page's route.
    expect(
      await getRelativeHref(browser, 'chat-page-hrefs', '/chat/[id]/settings')
    ).toBe('./123/settings/')
    // Cousin route: traverse up to the shared ancestor, then spell out the
    // target's segments below it.
    expect(await getRelativeHref(browser, 'chat-page-hrefs', '/pricing')).toBe(
      '../pricing/'
    )

    // Clicking the descendant link navigates to the settings page of the
    // current chat.
    await relativeHrefLink(
      browser,
      'chat-page-hrefs',
      '/chat/[id]/settings'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/chat/123/settings'
      )
      expect(await browser.elementByCss('#settings-page').text()).toBe(
        'Settings'
      )
    })
  })

  it('returns non-root-relative targets as-is', async () => {
    // The hook only treats root-relative targets ('/...') as route patterns.
    // Anything else — an absolute URL, a protocol-relative URL, a hash- or
    // query-only reference, an already-relative reference — is returned
    // verbatim, so passing an href through the hook never changes how a
    // <Link> behaves. In particular, no trailing slash is appended.
    const browser = await next.browser('/passthrough')
    const targets = [
      'https://example.com/docs',
      'https://example.com/docs?tab=1#top',
      '//example.com/cdn',
      'mailto:hi@example.com',
      '#faq',
      '?tab=files',
      'relative/path',
    ]
    for (const target of targets) {
      expect(
        await getRelativeHref(browser, 'passthrough-page-hrefs', target)
      ).toBe(target)
    }

    // A query-only reference behaves like it would on a plain <Link>: it
    // navigates to the current pathname with the query applied.
    await relativeHrefLink(
      browser,
      'passthrough-page-hrefs',
      '?tab=files'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/passthrough'
      )
      expect(await browser.eval('window.location.search')).toBe('?tab=files')
    })
  })

  it('preserves a query and hash from the target', async () => {
    let browser = await next.browser('/chat/123')
    // The query/hash is carried over verbatim, after the trailing slash of
    // the path portion. Only the path participates in matching.
    expect(
      await getRelativeHref(browser, 'chat-page-hrefs', '/chat/[id]?tab=files')
    ).toBe('./123/?tab=files')
    expect(
      await getRelativeHref(browser, 'chat-page-hrefs', '/pricing#faq')
    ).toBe('../pricing/#faq')
    expect(
      await getRelativeHref(
        browser,
        'chat-page-hrefs',
        '/chat/[id]/settings?tab=members#invite'
      )
    ).toBe('./123/settings/?tab=members#invite')

    // Clicking the combined query+hash link lands on the settings page of
    // the current chat with both preserved.
    await relativeHrefLink(
      browser,
      'chat-page-hrefs',
      '/chat/[id]/settings?tab=members#invite'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/chat/123/settings'
      )
      expect(await browser.eval('window.location.search')).toBe('?tab=members')
      expect(await browser.eval('window.location.hash')).toBe('#invite')
      expect(await browser.elementByCss('#settings-page').text()).toBe(
        'Settings'
      )
    })

    // And a query-only link navigates to the current chat page with the
    // query applied.
    browser = await next.browser('/chat/123')
    await relativeHrefLink(
      browser,
      'chat-page-hrefs',
      '/chat/[id]?tab=files'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/chat/123')
      expect(await browser.eval('window.location.search')).toBe('?tab=files')
      expect(await browser.elementByCss('#chat-page-id').text()).toBe('123')
    })
  })

  it('clicking ancestor and cousin targets navigates to those routes', async () => {
    let browser = await next.browser('/chat/123')
    await relativeHrefLink(browser, 'chat-page-hrefs', '/chat').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/chat')
      expect(await browser.elementByCss('#chat-index-page').text()).toBe(
        'Chat index'
      )
    })

    browser = await next.browser('/chat/123')
    await relativeHrefLink(browser, 'chat-page-hrefs', '/pricing').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/pricing')
      expect(await browser.elementByCss('#pricing-page').text()).toBe('Pricing')
    })
  })

  it('resolves targets relative to a nested page', async () => {
    const browser = await next.browser('/chat/123/settings')
    expect(await getRelativeHref(browser, 'settings-page-hrefs', '/chat')).toBe(
      '../'
    )
    expect(
      await getRelativeHref(browser, 'settings-page-hrefs', '/chat/[id]')
    ).toBe('./')
    expect(await getRelativeHref(browser, 'settings-page-hrefs', '/')).toBe(
      '../../'
    )
    expect(
      await getRelativeHref(browser, 'settings-page-hrefs', '/pricing')
    ).toBe('../../pricing/')

    // Clicking the own-route target of the parent layout navigates to the
    // current chat's page.
    await relativeHrefLink(browser, 'settings-page-hrefs', '/chat/[id]').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/chat/123')
      expect(await browser.elementByCss('#chat-page-id').text()).toBe('123')
    })
  })

  it('is position-independent: a layout-rendered instance matches a page-rendered instance', async () => {
    const browser = await next.browser('/chat/123/settings')
    // The same client component is rendered by app/chat/[id]/layout.tsx
    // (wrapper #chat-layout-hrefs) and by the settings page
    // (wrapper #settings-page-hrefs). The result depends only on the current
    // URL and the target, not on the render position.
    expect(await getRelativeHref(browser, 'chat-layout-hrefs', '/chat')).toBe(
      '../'
    )
    expect(
      await getRelativeHref(browser, 'chat-layout-hrefs', '/chat/[id]')
    ).toBe('./')
    expect(await getRelativeHref(browser, 'chat-layout-hrefs', '/')).toBe(
      '../../'
    )
    expect(
      await getRelativeHref(browser, 'chat-layout-hrefs', '/pricing')
    ).toBe('../../pricing/')
  })

  it('leaves an unresolvable dynamic segment as literal text', async () => {
    // /pricing does not lie on the /chat/[id] route, so there's no value
    // available for [id]; the literal segment text is left in the result.
    // /pricing has URL depth 1, so the resolution base is the root and no
    // upward traversal is needed, hence the './' prefix.
    const browser = await next.browser('/pricing')
    expect(
      await getRelativeHref(browser, 'pricing-page-hrefs', '/chat/[id]')
    ).toBe('./chat/[id]/')
  })

  if (isNextDev) {
    it('warns in development about unresolvable params and catch-all targets', async () => {
      const browser = await next.browser('/warnings')
      expect(
        await getRelativeHref(browser, 'warnings-page-hrefs', '/chat/[id]')
      ).toBe('./chat/[id]/')
      expect(
        await getRelativeHref(browser, 'warnings-page-hrefs', '/docs/[...slug]')
      ).toBe('./docs/[...slug]/')

      await retry(async () => {
        const logs = await browser.log()
        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                'could not resolve the dynamic segment(s) [id]'
              ),
            }),
            expect.objectContaining({
              message: expect.stringContaining(
                'does not support catch-all segment patterns ([...slug])'
              ),
            }),
          ])
        )
      })
    })
  }

  it('resolves against the most specific parallel route match', async () => {
    // At /parallel/123, the children slot matches via /parallel/[id] while
    // @slot matches the same URL part via [...catchAll]. The matched route
    // is computed on the server from the route tree, so a component
    // rendered inside the catch-all slot still resolves '[id]' targets.
    const browser = await next.browser('/parallel/123')
    expect(
      await getRelativeHref(browser, 'parallel-slot-hrefs', '/parallel/[id]')
    ).toBe('./123/')
    expect(
      await getRelativeHref(browser, 'parallel-slot-hrefs', '/parallel')
    ).toBe('./')
    expect(await getRelativeHref(browser, 'parallel-slot-hrefs', '/')).toBe(
      '../'
    )
    // The page in the children slot agrees.
    expect(
      await getRelativeHref(browser, 'parallel-page-hrefs', '/parallel/[id]')
    ).toBe('./123/')

    // Clicking the root link from inside the catch-all slot lands on the
    // home page. (There is no /parallel index page — these tests only visit
    // URLs the slot's catch-all also matches.)
    await relativeHrefLink(browser, 'parallel-slot-hrefs', '/').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/')
      expect(await browser.elementByCss('#home-page').text()).toBe('Home')
    })
  })

  it('resolves from the actual URL on the 404 page', async () => {
    // The built-in /_not-found route renders at arbitrary URLs — its
    // pseudo-segments never appear in URL space — so it provides no
    // statically resolvable path, and hrefs resolve against the actual URL,
    // whatever its depth.
    const browser = await next.browser('/this/page/does/not/exist')
    expect(await browser.elementByCss('#not-found-page').text()).toBe(
      'Not found'
    )
    expect(await getRelativeHref(browser, 'not-found-hrefs', '/')).toBe(
      '../../../../'
    )
    expect(await getRelativeHref(browser, 'not-found-hrefs', '/pricing')).toBe(
      '../../../../pricing/'
    )

    await relativeHrefLink(browser, 'not-found-hrefs', '/pricing').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/pricing')
      expect(await browser.elementByCss('#pricing-page').text()).toBe('Pricing')
    })
  })

  it('computes traversal from the actual URL on a catch-all route', async () => {
    // The number of segments matched by [...slug] is a per-request value, so
    // the traversal is computed from the actual URL.
    const browser = await next.browser('/docs/a/b/c')
    expect(await getRelativeHref(browser, 'docs-page-hrefs', '/docs')).toBe(
      '../../'
    )
    expect(await getRelativeHref(browser, 'docs-page-hrefs', '/')).toBe(
      '../../../'
    )

    await relativeHrefLink(browser, 'docs-page-hrefs', '/docs').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/docs')
      expect(await browser.elementByCss('#docs-index-page').text()).toBe(
        'Docs index'
      )
    })
  })

  it('navigates via relative links and updates hook values after client-side navigation', async () => {
    const browser = await next.browser('/chat/123')
    expect(
      await getRelativeHref(browser, 'chat-layout-hrefs', '/chat/[id]')
    ).toBe('./123/')

    // The chat layout renders a Link whose href is
    // unstable_useRelativeHref('/chat') + '456', i.e. './456' on /chat/123,
    // which resolves to /chat/456.
    await browser.elementByCss('#link-to-chat-456').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/chat/456')
      expect(await browser.elementByCss('#chat-page-id').text()).toBe('456')
    })

    // Client-nav reactivity: hook results reflect the new URL.
    await retry(async () => {
      expect(
        await getRelativeHref(browser, 'chat-layout-hrefs', '/chat/[id]')
      ).toBe('./456/')
      expect(await getRelativeHref(browser, 'chat-page-hrefs', '/chat')).toBe(
        './'
      )
    })

    // Before clicking, verify the second relative link
    // (unstable_useRelativeHref('/chat/[id]') + 'settings') now resolves to
    // the settings page of the *new* chat.
    await retry(async () => {
      const resolvedPathname = await browser.eval(
        `new URL(document.getElementById('link-to-current-chat-settings').getAttribute('href'), window.location.href).pathname`
      )
      expect(resolvedPathname).toBe('/chat/456/settings')
    })

    await browser.elementByCss('#link-to-current-chat-settings').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/chat/456/settings'
      )
      expect(await browser.elementByCss('#settings-page').text()).toBe(
        'Settings'
      )
      // The layout's own route is now an ancestor of the current page.
      expect(
        await getRelativeHref(browser, 'chat-layout-hrefs', '/chat/[id]')
      ).toBe('./')
    })
  })

  it('recomputes hrefs from the new URL after a client-side navigation between params', async () => {
    // After the first router update, hrefs resolve against the URL pathname
    // (the same source usePathname reads), so a navigation between params of
    // the dynamic segment updates every instance — including those rendered
    // inside the catch-all slot.
    //
    // Note: webpack production builds have a pre-existing router bug
    // (reproducible on canary): when a dynamic route has a sibling catch-all
    // parallel slot, this navigation applies only the slot's tree patch and
    // the children page keeps rendering the old param. The hook doesn't read
    // the router tree, so the hrefs below are correct regardless.
    const browser = await next.browser('/parallel/123')
    expect(
      await getRelativeHref(browser, 'parallel-slot-hrefs', '/parallel/[id]')
    ).toBe('./123/')
    expect(
      await getRelativeHref(browser, 'parallel-page-hrefs', '/parallel/[id]')
    ).toBe('./123/')

    await browser.elementByCss('#parallel-nav-link').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/parallel/456'
      )
    })

    // Both the catch-all slot and the children page resolve against the new
    // URL (id = 456).
    await retry(async () => {
      expect(
        await getRelativeHref(browser, 'parallel-slot-hrefs', '/parallel/[id]')
      ).toBe('./456/')
      expect(
        await getRelativeHref(browser, 'parallel-slot-hrefs', '/parallel')
      ).toBe('./')
      expect(await getRelativeHref(browser, 'parallel-slot-hrefs', '/')).toBe(
        '../'
      )
      expect(
        await getRelativeHref(browser, 'parallel-page-hrefs', '/parallel/[id]')
      ).toBe('./456/')
    })

    // Clicking the recomputed own-route link navigates (back) to the
    // current parallel page.
    await relativeHrefLink(
      browser,
      'parallel-page-hrefs',
      '/parallel/[id]'
    ).click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/parallel/456'
      )
    })
  })

  it('ignores content grafted into a default slot when resolving hrefs', async () => {
    // At /graft/a/b/c, @side matches the URL with a fully static path
    // (graft/a/b/c) while the children slot collapses the same URL parts
    // into [...slug]. The static path is statically resolvable, so the
    // matched route the server computes is 4 URL parts deep.
    const browser = await next.browser('/graft/a/b/c')
    expect(await browser.elementByCss('#graft-side-abc').text()).toBe(
      'side abc'
    )
    expect(await getRelativeHref(browser, 'graft-page-hrefs', '/')).toBe(
      '../../../'
    )
    expect(await getRelativeHref(browser, 'graft-page-hrefs', '/graft')).toBe(
      '../../'
    )

    // Soft-navigate to /graft/x/y. @side has no match there, so the server
    // sends a default segment for the slot and the client grafts the old
    // a/b/c content into it instead of rendering @side/default.tsx. The
    // grafted subtree keeps displaying the old URL's content, but hrefs now
    // resolve against the current URL, which is only 3 parts deep
    // (graft/x/y via [...slug]) — the stale content doesn't affect them.
    await browser.elementByCss('#graft-nav-link').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/graft/x/y')
      expect(await browser.elementByCss('#graft-page-slug').text()).toBe(
        'Graft page for x/y'
      )
    })

    // The graft actually happened: the old slot content is still displayed
    // and the default slot content was not rendered.
    expect(await browser.elementByCss('#graft-side-abc').text()).toBe(
      'side abc'
    )
    expect(await browser.hasElementByCssSelector('#graft-side-default')).toBe(
      false
    )

    await retry(async () => {
      expect(await getRelativeHref(browser, 'graft-page-hrefs', '/')).toBe(
        '../../'
      )
      expect(await getRelativeHref(browser, 'graft-page-hrefs', '/graft')).toBe(
        '../'
      )
    })

    // Clicking the '/graft' link resolves against the *current* URL's depth
    // and lands on the graft index page.
    await relativeHrefLink(browser, 'graft-page-hrefs', '/graft').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/graft')
      expect(await browser.elementByCss('#graft-index-page').text()).toBe(
        'Graft index'
      )
    })
  })
})
