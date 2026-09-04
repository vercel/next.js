import { isNextDeploy, isNextStart, nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../../../lib/router-act'
import { findPort, retry } from 'next-test-utils'

import { basePath, url } from './base-path'
import { startExternalServer } from './external-server.mjs'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    // TODO(variants): enable this for a deployment. A platform serves a
    // combination from the routing rules the adapter emits, and those do not
    // exist yet, so every assertion here is about a self-hosted server.
    skipDeployment: true,
    // Handed to the build rather than read from `process.env` there, so that a
    // deployed build receives it too: only what goes through here is forwarded
    // to the remote build.
    env: basePath ? { BASE_PATH: basePath } : undefined,
    // The proxy rewrites `/external` to a port that only exists once the
    // external server is listening, so Next.js is started by hand below.
    skipStart: true,
  })

  if (skipped) {
    return
  }

  let externalServer: Awaited<ReturnType<typeof startExternalServer>>

  beforeAll(async () => {
    const port = await findPort()

    externalServer = await startExternalServer(port)
    next.env.EXTERNAL_SERVER_PORT = String(port)

    await next.start()
  })

  afterAll(async () => {
    await next.stop()
    await externalServer.cleanup()
  })

  it('should resolve a variant to its default value', async () => {
    const $ = await next.render$(url('/'))

    expect($('#theme').text()).toBe('light')
    expect($('#locale').text()).toBe('en')
  })

  it('should resolve a variant from the request', async () => {
    const $ = await next.render$(url('/'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  it('should resolve several variants from one request', async () => {
    const $ = await next.render$(url('/'), undefined, {
      headers: { cookie: 'theme=dark; locale=de' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('de')
  })

  it('should not expose the internal variants prefix to the client', async () => {
    const browser = await next.browser(url('/'))

    expect(await browser.elementByCss('#theme').text()).toBe('light')
    expect(await browser.eval('location.pathname')).toBe(url('/'))
  })

  it('should not expose the resolved values to the client', async () => {
    const response = await next.fetch(url('/'), {
      headers: { cookie: 'theme=dark' },
    })

    // The values reach the origin as a request header, so the response does not
    // carry them back to the client.
    expect(response.headers.get('x-next-internal-variants')).toBeNull()
  })

  it('should not expose the resolved values through `headers()`', async () => {
    const $ = await next.render$(url('/'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#internal-variants-header').text()).toBe('absent')
  })
  it('should not let a client resolve the variants itself', async () => {
    const forged = encodeURIComponent(
      JSON.stringify([['theme@variants.ts', 'dark']])
    )

    const $ = await next.render$(url('/unmatched-by-proxy'), undefined, {
      headers: { 'x-next-internal-variants': forged },
    })

    // Next.js removes the header on arrival. The read therefore finds nothing,
    // and not the values that the client sent.
    expect($('#theme').length).toBe(0)
    expect($('#pending').text()).toBe('pending')

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'read variant `theme@variants.ts`, but no value was resolved for this request'
      )
    })
  })

  it('should fail a read on a route the proxy does not match', async () => {
    const $ = await next.render$(url('/unmatched-by-proxy'))

    // `connection()` holds the read until request time. The shell reaches the
    // client before the read fails, so the boundary below it stays pending.
    expect($('#pending').text()).toBe('pending')
    expect($('#theme').length).toBe(0)

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'read variant `theme@variants.ts`, but no value was resolved for this request'
      )
    })
  })

  it('should resolve a variant on the route the proxy rewrote to', async () => {
    const $ = await next.render$(url('/rewrite-source'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  it('should expose neither the rewrite nor the variants prefix to the client', async () => {
    const browser = await next.browser(url('/rewrite-source'))

    expect(await browser.elementByCss('#theme').text()).toBe('light')
    expect(await browser.eval('location.pathname')).toBe(url('/rewrite-source'))
  })

  it('should resolve enumerated variants on a prerendered route', async () => {
    const dark = await next.browser(url('/enumerated/a'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'dark', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await dark.elementByCss('#theme').text()).toBe('dark')
      expect(await dark.elementByCss('#locale').text()).toBe('en')
    })

    const light = await next.browser(url('/enumerated/a'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'light', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await light.elementByCss('#theme').text()).toBe('light')
    })
  })

  it('should prerender a route without dynamic segments per combination', async () => {
    // This route reads a variant above every boundary, which only a declared
    // combination permits: the value is baked, so it leaves no hole to resume.
    const dark = await next.browser(url('/paramless'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'dark', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await dark.elementByCss('#theme').text()).toBe('dark')
      expect(await dark.elementByCss('#locale').text()).toBe('en')
    })

    const light = await next.browser(url('/paramless'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'light', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await light.elementByCss('#theme').text()).toBe('light')
    })
  })

  if (isNextStart || isNextDeploy) {
    it('should serve a route without dynamic segments from its own prerender', async () => {
      for (const theme of ['light', 'dark']) {
        const response = await next.fetch(url('/paramless'), {
          headers: { cookie: `theme=${theme}` },
        })

        if (isNextDeploy) {
          expect(response.headers.get('x-vercel-cache')).toMatch(
            /^(HIT|PRERENDER|STALE)$/
          )
        } else {
          expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
        }

        const browser = await next.browser(url('/paramless'), {
          async beforePageLoad(page: Playwright.Page) {
            await page
              .context()
              .addCookies([{ name: 'theme', value: theme, url: next.url }])
          },
        })

        await retry(async () => {
          expect(await browser.elementByCss('#theme').text()).toBe(theme)
        })
      }
    })

    it('should serve each combination from its own prerender', async () => {
      // A cache hit is what distinguishes serving the artifact prerendered for
      // this combination from rendering the route again, which would produce
      // the same markup either way.
      for (const theme of ['light', 'dark']) {
        const response = await next.fetch(url('/enumerated/a'), {
          headers: { cookie: `theme=${theme}` },
        })

        if (isNextDeploy) {
          expect(response.headers.get('x-vercel-cache')).toMatch(
            /^(HIT|PRERENDER|STALE)$/
          )
        } else {
          expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
        }

        const browser = await next.browser(url('/enumerated/a'), {
          async beforePageLoad(page: Playwright.Page) {
            await page
              .context()
              .addCookies([{ name: 'theme', value: theme, url: next.url }])
          },
        })

        await retry(async () => {
          expect(await browser.elementByCss('#theme').text()).toBe(theme)
        })
      }
    })
  }

  it('should leave a variant that the matched group omits a dynamic hole', async () => {
    // A response carrying `en` would mean the more specific prerender served a
    // request it does not describe.
    if (isNextStart && process.env.__NEXT_CACHE_COMPONENTS) {
      // The shell shows which prerender served the request. This one bakes
      // `theme` and leaves `locale` pending, which only the smaller group's
      // prerender does: the larger one bakes both, and the one that omits every
      // variant bakes neither.
      const $ = await next.render$(url('/specificity'), undefined, {
        headers: { cookie: 'theme=dark; locale=de' },
      })

      expect($('#theme').text()).toBe('dark')
      expect($('#locale').text()).toBe('pending')
    }

    // A browser rather than the served markup, because the hole is unfilled in
    // the shell and resolves after it arrives.
    const browser = await next.browser(url('/specificity'), {
      async beforePageLoad(page: Playwright.Page) {
        await page.context().addCookies([
          { name: 'theme', value: 'dark', url: next.url },
          { name: 'locale', value: 'de', url: next.url },
        ])
      },
    })

    // A browser context outlives the test that opened it, and `locale=de`
    // matches no combination of `/enumerated/[slug]`, so a later test would
    // prefetch a different artifact than the one it asserts on.
    await using _ = defer(() => browser.deleteCookies())

    await retry(async () => {
      expect(await browser.elementByCss('#theme').text()).toBe('dark')
      expect(await browser.elementByCss('#locale').text()).toBe('de')
    })
  })

  it('should serve a combination no group declares from the prerender that omits variants', async () => {
    // The values are set rather than left out. An earlier test leaves
    // `theme=dark` in the browser context, and this case is about a resolved
    // combination that no group declares, not about an absent cookie.
    const browser = await next.browser(url('/specificity'), {
      async beforePageLoad(page: Playwright.Page) {
        await page.context().addCookies([
          { name: 'theme', value: 'light', url: next.url },
          { name: 'locale', value: 'en', url: next.url },
        ])
      },
    })

    await using _ = defer(() => browser.deleteCookies())

    await retry(async () => {
      expect(await browser.elementByCss('#theme').text()).toBe('light')
      expect(await browser.elementByCss('#locale').text()).toBe('en')
    })
  })

  if (isNextStart) {
    it('should serve a request that matches every group from the most specific', async () => {
      // The smaller group leaves `locale` a hole, so markup carrying both
      // values can only have come from the larger one.
      const $ = await next.render$(url('/specificity'), undefined, {
        headers: { cookie: 'theme=dark; locale=en' },
      })

      expect($('#theme').text()).toBe('dark')
      expect($('#locale').text()).toBe('en')
    })
  }

  if ((isNextStart || isNextDeploy) && process.env.__NEXT_CACHE_COMPONENTS) {
    it('should prefetch a declared variant and leave an undeclared one to the navigation', async () => {
      // `/on-demand/[slug]` declares `theme` and reads `banner`, which no
      // combination declares. The declared value is baked into the artifact of
      // the combination, so a prefetch carries it. The undeclared value is a
      // hole that no artifact may contain, so the prefetch carries the fallback
      // instead, and only the navigation resolves it.
      let page: Playwright.Page | undefined

      const browser = await next.browser(url('/prefetch-hub'), {
        async beforePageLoad(p: Playwright.Page) {
          page = p

          await p.context().addCookies([
            { name: 'theme', value: 'dark', url: next.url },
            { name: 'banner', value: 'shown', url: next.url },
          ])
        },
      })

      if (!page) {
        throw new Error('The page was not captured before it loaded.')
      }

      // A value behind a boundary reaches the payload as a row the boundary
      // refers to, rather than inline, so these match the row.
      const declaredValue = '"dark"\n'
      const undeclaredValue = '"shown"\n'
      const undeclaredFallback = '"id":"banner","children":"pending"'

      // The shell of the route arrives in an app-shell prefetch, which `act`
      // leaves out of matching unless a test asks for it. The values this test
      // is about are in that response.
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // `act` states that a response contains something. That a response
      // contains nothing has to be collected here, and it is the point of this
      // test: a prefetch must not carry a value no combination declared.
      const prefetched: string[] = []

      const collect = async (response: Playwright.Response) => {
        try {
          prefetched.push(await response.text())
        } catch {
          // A response whose body is gone by now cannot carry the value either.
        }
      }

      page.on('response', collect)

      await act(
        async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/on-demand/built"]'
          )

          await toggle.click()
        },
        { includes: declaredValue }
      )

      page.off('response', collect)

      // The declared value ships with the prerender of its combination, so a
      // prefetch carries it. The undeclared one is a hole no prerender holds,
      // so the prefetch carries the fallback in its place instead.
      expect(prefetched.some((body) => body.includes(undeclaredFallback))).toBe(
        true
      )
      expect(prefetched.some((body) => body.includes(undeclaredValue))).toBe(
        false
      )

      await act(async () => {
        const link = await browser.elementByCss(
          `a[href="${url('/on-demand/built')}"]`
        )

        await link.click()
      })

      // A value behind a boundary reaches the payload as a row the boundary
      // refers to, so the rendered page is what states which values arrived.
      await retry(async () => {
        expect(await browser.elementByCss('#theme').text()).toBe('dark')
        expect(await browser.elementByCss('#banner').text()).toBe('shown')
      })

      expect(await browser.elementByCss('#slug').text()).toBe('built')
    })
  }

  if (isNextStart || isNextDeploy) {
    it('should prefetch the combination of a param that was never enumerated', async () => {
      // A prefetch asks for the RSC payload of the route, not for the page, so
      // the path it requests carries a suffix. The prefixed rule of this route
      // matches the plain shape only, and its param group can take a suffix as
      // part of the param. A prefetch would then resolve the slug
      // `never-enumerated.rsc`, and the payload would describe a different page
      // than the one the link names.
      //
      // The assertion quotes the value, so a slug that kept the suffix does not
      // satisfy it.
      let page: Playwright.Page

      const browser = await next.browser(url('/prefetch-hub'), {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })

      const act = createRouterAct(page)

      await act(
        async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/enumerated/never-enumerated"]'
          )

          await toggle.click()
        },
        // Matched on the element that renders the slug, and quoted, so a slug
        // that kept the `.rsc` suffix does not satisfy it.
        { includes: '"id":"slug","children":"never-enumerated"' }
      )
    })
  }

  it('should resolve variants for a param that was never enumerated', async () => {
    // `on-demand` has no `generateStaticParams` row, so it is generated on
    // demand. The proxy has still resolved a combination for the request.
    // Generation specializes on that combination as it specializes on params,
    // rather than finding no value and bailing out of the render.
    const dark = await next.render$(url('/enumerated/on-demand'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect(dark('#theme').text()).toBe('dark')

    const light = await next.render$(url('/enumerated/on-demand'), undefined, {
      headers: { cookie: 'theme=light' },
    })

    expect(light('#theme').text()).toBe('light')
  })

  it('should render an unknown param dynamically when it reads a runtime variant', async () => {
    if (isNextStart) {
      const response = await next.fetch(url('/conditional-runtime/built'), {
        headers: { cookie: 'theme=dark' },
      })

      expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
    }

    for (const banner of ['first', 'second']) {
      const browser = await next.browser(url('/conditional-runtime/runtime'), {
        async beforePageLoad(page: Playwright.Page) {
          await page.context().addCookies([
            { name: 'theme', value: 'dark', url: next.url },
            { name: 'banner', value: banner, url: next.url },
          ])
        },
      })

      await retry(async () => {
        expect(await browser.elementByCss('#theme').text()).toBe('dark')
        expect(await browser.elementByCss('#banner').text()).toBe(banner)
      })

      expect(await browser.elementByCss('#slug').text()).toBe('runtime')
    }
  })

  it('should prerender a fallback shell per variant combination', async () => {
    // `shell/[slug]` declares no static params, so its fallback shell is the
    // only thing prerendered for it. That shell reads a variant above the
    // boundary, so it can exist only where the combination is known. The param
    // stays a hole and resolves per request.
    const dark = await next.browser(url('/shell/anything'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'dark', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await dark.elementByCss('#theme').text()).toBe('dark')
      expect(await dark.elementByCss('#slug').text()).toBe('anything')
    })

    const light = await next.browser(url('/shell/other'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'light', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await light.elementByCss('#theme').text()).toBe('light')
      expect(await light.elementByCss('#slug').text()).toBe('other')
    })
  })

  it('should read a variant no combination declared without partitioning on it', async () => {
    // `banner` is named by no route's `unstable_generateStaticVariants`, so no
    // prerender exists per banner value and it must not select one. Both
    // requests are served the shell declared for `theme=dark`, which bakes the
    // theme and leaves the banner a hole that each request fills for itself.
    // Were the banner part of the cache key instead, neither request would find
    // a prerender at all. The banner is behind a boundary and no prerender
    // holds it, so the value arrives with the resume. The browser is what
    // observes that; the document on its own still carries the fallback.
    for (const banner of ['a', 'b']) {
      const browser = await next.browser(url('/shell/x'), {
        async beforePageLoad(page: Playwright.Page) {
          await page.context().addCookies([
            { name: 'theme', value: 'dark', url: next.url },
            { name: 'banner', value: banner, url: next.url },
          ])
        },
      })

      await retry(async () => {
        expect(await browser.elementByCss('#theme').text()).toBe('dark')
        expect(await browser.elementByCss('#banner').text()).toBe(banner)
      })
    }
  })

  it('should not bake a variant no combination declared into a prerender generated on demand', async () => {
    // `fresh` has no `generateStaticParams` row and the route's fallback shell
    // is empty, so the first request prerenders it on demand and caches the
    // result. That entry's key covers the param and the declared combination,
    // but not `banner`, so baking the banner would serve this request's value
    // to every later one.
    for (const banner of ['first', 'second']) {
      const cookies = async (page: Playwright.Page) => {
        await page.context().addCookies([
          { name: 'theme', value: 'dark', url: next.url },
          { name: 'banner', value: banner, url: next.url },
        ])
      }

      const browser = await next.browser(url('/on-demand/fresh'), {
        beforePageLoad: cookies,
      })

      await retry(async () => {
        expect(await browser.elementByCss('#theme').text()).toBe('dark')
        expect(await browser.elementByCss('#banner').text()).toBe(banner)
      })
    }
  })

  it('should serve two undeclared combinations of one unenumerated param their own values', async () => {
    // `/enumerated/[slug]` reads its param above every boundary, so its
    // fallback shell is empty, and it declares no combination with `locale=de`.
    // Both requests are therefore served the prerender that omits the variants,
    // and the resume supplies each request its own values.
    //
    // Were the empty shell answered by a blocking render instead, the first
    // request's values would be cached under a key that names no variant, and
    // the second request would be served them.
    for (const theme of ['dark', 'light']) {
      const browser = await next.browser(url('/enumerated/shared-entry'), {
        async beforePageLoad(page: Playwright.Page) {
          await page.context().addCookies([
            { name: 'theme', value: theme, url: next.url },
            { name: 'locale', value: 'de', url: next.url },
          ])
        },
      })

      await using _ = defer(() => browser.deleteCookies())

      await retry(async () => {
        expect(await browser.elementByCss('#theme').text()).toBe(theme)
        expect(await browser.elementByCss('#locale').text()).toBe('de')
      })

      expect(await browser.elementByCss('#slug').text()).toBe('shared-entry')
    }
  })

  it('should resolve a combination that was never declared', async () => {
    // `shell/[slug]` declares only `locale=en`, so this combination has no
    // prerender from the build. The proxy still resolved it, so a shell for it
    // is generated on demand rather than another combination's being served.
    const browser = await next.browser(url('/shell/undeclared'), {
      async beforePageLoad(page: Playwright.Page) {
        await page.context().addCookies([
          { name: 'theme', value: 'dark', url: next.url },
          { name: 'locale', value: 'de', url: next.url },
        ])
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#theme').text()).toBe('dark')
      expect(await browser.elementByCss('#locale').text()).toBe('de')
    })

    expect(await browser.elementByCss('#slug').text()).toBe('undeclared')
  })

  // TODO(variants): cover that a client cannot name the combination it is
  // served, whether by supplying the prefix or the `nxtV` parameter. One change
  // covers a self-hosted server and a deployment alike, so the guards and these
  // tests belong together.

  it('should not expose the internal combination query parameter to the page', async () => {
    // A combination with an output reaches the origin as a query parameter. A
    // route without one receives every value at runtime and needs no internal
    // query. In either case the internal parameter must not reach
    // `searchParams` the way a real query value does.
    const browser = await next.browser(url('/search-params?q=1'), {
      async beforePageLoad(page: Playwright.Page) {
        await page
          .context()
          .addCookies([{ name: 'theme', value: 'dark', url: next.url }])
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#theme').text()).toBe('dark')
      expect(await browser.elementByCss('#search-params').text()).toBe('q')
    })
  })

  it('should resolve an undeclared combination when the param is read without a boundary', async () => {
    // No prerender exists for this combination, and `enumerated/[slug]` awaits
    // its param at the top level with no boundary above it, so there is nothing
    // static to serve either way. How the values reach the render differs by
    // mode, which is the point of asserting it in both: with Cache Components
    // the request takes the prerender that omits every variant, whose shell is
    // empty for exactly that reason, and a resume fills it. Without them there
    // are no holes to fill, so the request has to be rendered for itself and
    // must not seed the entry the declared combinations are served from.
    const browser = await next.browser(url('/enumerated/a'), {
      async beforePageLoad(page: Playwright.Page) {
        await page.context().addCookies([
          { name: 'theme', value: 'dark', url: next.url },
          { name: 'locale', value: 'de', url: next.url },
        ])
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#theme').text()).toBe('dark')
      expect(await browser.elementByCss('#locale').text()).toBe('de')
    })

    expect(await browser.elementByCss('#slug').text()).toBe('a')
  })

  // The other origin is a server on this machine's loopback interface, which a
  // deployment cannot reach, so this one is inherently self-hosted.
  if (!isNextDeploy) {
    it('should not send resolved values to another origin', async () => {
      const $ = await next.render$(url('/external'), undefined, {
        headers: { cookie: 'theme=dark' },
      })

      expect($('#external').text()).toBe('external')

      const received = externalServer.getReceivedRequests()
      expect(received).toHaveLength(1)

      // A decorated destination would arrive as `/__variants/<hash>/external`,
      // which the other origin knows nothing about and would not strip.
      expect(received[0].url).toBe('/external')

      // The other origin renders no route of this application, and it does not
      // remove an internal header. The proxy therefore drops the values.
      expect(received[0].headers['x-next-internal-variants']).toBeUndefined()
    })
  }
})

// `await using` runs this when the test that declared it returns, so a browser
// context is cleaned up even when an assertion above it fails.
function defer(callback: () => Promise<void>) {
  return { [Symbol.asyncDispose]: callback }
}
