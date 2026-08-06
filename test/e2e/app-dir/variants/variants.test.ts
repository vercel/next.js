import { isNextDeploy, isNextStart, nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { NEXT_VARIANTS_QUERY_PARAM } from 'next/dist/lib/constants'
import { hashVariants } from 'next/dist/server/variants/hash'
import { findVariantGroupsForPathname } from 'next/dist/server/variants/manifest'

import { startExternalServer } from './external-server.mjs'

describe('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    skipDeployment: false,
    // The proxy rewrites `/external` to a port that only exists once the
    // external server is listening, so Next.js is started by hand below.
    skipStart: true,
  })

  if (skipped) {
    return
  }

  let externalServer: {
    getReceivedUrls: () => string[]
    cleanup: () => Promise<void>
  }

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
    const $ = await next.render$('/')

    expect($('#theme').text()).toBe('light')
    expect($('#locale').text()).toBe('en')
  })

  it('should resolve a variant from the request', async () => {
    const $ = await next.render$('/', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  it('should resolve several variants from one request', async () => {
    const $ = await next.render$('/', undefined, {
      headers: { cookie: 'theme=dark; locale=de' },
    })

    // More than one resolved variant packs into a single path segment joined by
    // `&`, so this covers that the segment round-trips through the router.
    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('de')
  })

  it('should not expose the internal variants prefix to the client', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#theme').text()).toBe('light')
    expect(await browser.eval('location.pathname')).toBe('/')
  })

  it('should resolve a variant on the route the proxy rewrote to', async () => {
    const $ = await next.render$('/rewrite-source', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  it('should expose neither the rewrite nor the variants prefix to the client', async () => {
    const browser = await next.browser('/rewrite-source')

    expect(await browser.elementByCss('#theme').text()).toBe('light')
    expect(await browser.eval('location.pathname')).toBe('/rewrite-source')
  })

  it('should resolve enumerated variants on a prerendered route', async () => {
    const dark = await next.render$('/enumerated/a', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect(dark('#theme').text()).toBe('dark')
    expect(dark('#locale').text()).toBe('en')

    const light = await next.render$('/enumerated/a', undefined, {
      headers: { cookie: 'theme=light' },
    })

    expect(light('#theme').text()).toBe('light')
  })

  it('should prerender a route without dynamic segments per combination', async () => {
    // The route declares combinations but has no params, so it builds no static
    // paths and the combinations are the only axis it is prerendered against.
    // Reading a variant above a boundary is only possible because of them: the
    // value is baked, so it leaves no hole to resume.
    const dark = await next.render$('/paramless', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect(dark('#theme').text()).toBe('dark')
    expect(dark('#locale').text()).toBe('en')

    const light = await next.render$('/paramless', undefined, {
      headers: { cookie: 'theme=light' },
    })

    expect(light('#theme').text()).toBe('light')
  })

  if (isNextStart) {
    it('should serve a route without dynamic segments from its own prerender', async () => {
      for (const theme of ['light', 'dark']) {
        const response = await next.fetch('/paramless', {
          headers: { cookie: `theme=${theme}` },
        })

        expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
        expect(await response.text()).toContain(`<p id="theme">${theme}</p>`)
      }
    })

    it('should serve each combination from its own prerender', async () => {
      // A cache hit is what distinguishes serving the artifact prerendered for
      // this combination from rendering the route again, which would produce
      // the same markup either way.
      for (const theme of ['light', 'dark']) {
        const response = await next.fetch('/enumerated/a', {
          headers: { cookie: `theme=${theme}` },
        })

        expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
        expect(await response.text()).toContain(`<p id="theme">${theme}</p>`)
      }
    })
  }

  if (isNextStart) {
    it('should let the proxy resolve a pathname to the combinations its route declared', async () => {
      // The proxy runs before any routing of ours and has only a pathname, so
      // it matches against this manifest rather than looking a route up by
      // name. Getting that wrong is silent: the proxy would hash against the
      // wrong key set and send the request to an output nobody wrote.
      const variantsManifest = JSON.parse(
        await next.readFile('.next/server/variants-manifest.json')
      )

      const keysFor = (pathname: string) =>
        findVariantGroupsForPathname(variantsManifest, pathname)?.map(
          (group) => group.keys
        ) ?? null

      const theme = 'theme@variants.ts'
      const locale = 'locale@variants.ts'

      // A route without dynamic segments is matched by pathname.
      expect(keysFor('/paramless')).toEqual([[locale, theme]])

      // One with them is matched by its route regex, for any param value.
      expect(keysFor('/enumerated/anything')).toEqual([[locale, theme]])
      expect(keysFor('/shell/anything')).toEqual([[locale, theme]])

      // Declaring a different set of variants gives a different key set, which
      // is what the proxy projects onto. Projecting onto another route's keys
      // would produce a hash naming a combination this route never declared.
      expect(keysFor('/on-demand/anything')).toEqual([[theme]])

      // A route that declares nothing gets no prefix at all, and is served the
      // artifact that bakes no variant.
      expect(keysFor('/plain')).toBeNull()
      expect(keysFor('/enumerated/a/deeper')).toBeNull()
    })

    it('should derive every data route from the entry it belongs to', async () => {
      // An entry is keyed by the path its artifacts were written to, so its
      // `dataRoute` has to be derived from that same path. Deriving it from the
      // bare pathname instead gives every combination of a route the same data
      // route, naming a file nobody wrote.
      //
      // Nothing self-hosted opens that path, which is what let it pass five
      // green suites: a deployment's build output assembly reads it, and fails
      // with an ENOENT naming a file rather than anything pointing at variants.
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      const mismatched = Object.entries(
        prerenderManifest.routes as Record<string, { dataRoute: string | null }>
      )
        .filter(([, { dataRoute }]) => dataRoute !== null)
        .map(([route, { dataRoute }]) => ({
          route,
          dataRoute,
          // What the key implies, `/` being written as `/index`.
          expected: `${route === '/' ? '/index' : route}.rsc`,
        }))
        .filter(({ dataRoute, expected }) => dataRoute !== expected)

      expect(mismatched).toEqual([])
    })

    it('should write one prerender manifest entry per declared combination', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      const paramlessRoutes = Object.keys(prerenderManifest.routes)
        .filter((route) => route.endsWith('/paramless'))
        .sort()

      // `paramless` declares two combinations and has no params, so the
      // combinations are the only axis it is prerendered against. Each is
      // written under its own hash, because each bakes different values and an
      // entry describes the render that produced it, down to its cache control.
      expect(paramlessRoutes).toEqual(
        [
          `/__variants/${hashVariants({
            'theme@variants.ts': 'dark',
            'locale@variants.ts': 'en',
          })}/paramless`,
          `/__variants/${hashVariants({
            'theme@variants.ts': 'light',
            'locale@variants.ts': 'en',
          })}/paramless`,
          // The clean path holds the prerender that omits every variant, which
          // is what an undeclared combination is served from. Omitting a
          // variant leaves a hole that only a resume can fill, so this entry
          // exists only where the route is partially prerendered.
          ...(process.env.__NEXT_CACHE_COMPONENTS ? ['/paramless'] : []),
        ].sort()
      )
    })
  }

  it('should resolve variants for a param that was never enumerated', async () => {
    // `on-demand` has no `generateStaticParams` row, so it is generated on
    // demand. The proxy has still resolved a combination for the request, and
    // generation specializes on it the same way it specializes on params,
    // rather than finding no value and bailing out of the render.
    const dark = await next.render$('/enumerated/on-demand', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect(dark('#theme').text()).toBe('dark')

    const light = await next.render$('/enumerated/on-demand', undefined, {
      headers: { cookie: 'theme=light' },
    })

    expect(light('#theme').text()).toBe('light')
  })

  it('should prerender a fallback shell per variant combination', async () => {
    // `shell/[slug]` declares no static params, so the fallback shell is the
    // only thing prerendered for it, and reading a variant above the boundary
    // means that shell can only exist if the combination is known. The param
    // itself stays a hole and resolves per request.
    const dark = await next.render$('/shell/anything', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect(dark('#theme').text()).toBe('dark')
    // The shell ships the boundary's fallback and the resolved param arrives
    // after it, so both are present in the streamed HTML.
    expect(dark('#slug').last().text()).toBe('anything')

    const light = await next.render$('/shell/other', undefined, {
      headers: { cookie: 'theme=light' },
    })

    expect(light('#theme').text()).toBe('light')
    expect(light('#slug').last().text()).toBe('other')
  })

  it('should read a variant no combination declared without partitioning on it', async () => {
    // `banner` is named by no route's `generateStaticVariants`, so no prerender
    // exists per banner value and it must not select one. Both requests are
    // served the shell declared for `theme=dark`, which bakes the theme and
    // leaves the banner a hole that each request fills for itself. Were the
    // banner part of the cache key instead, neither request would find a
    // prerender at all.
    const a = await next.render$('/shell/x', undefined, {
      headers: { cookie: 'theme=dark; banner=a' },
    })

    expect(a('#theme').text()).toBe('dark')
    expect(a('#banner').last().text()).toBe('a')

    const b = await next.render$('/shell/x', undefined, {
      headers: { cookie: 'theme=dark; banner=b' },
    })

    expect(b('#theme').text()).toBe('dark')
    expect(b('#banner').last().text()).toBe('b')
  })

  it('should not bake a variant no combination declared into a prerender generated on demand', async () => {
    // `fresh` has no `generateStaticParams` row and the route's fallback shell is
    // empty, so the first request prerenders it on demand and caches the result.
    // That entry's key covers the param and the declared combination, but not
    // `banner`, so baking the banner would serve this request's value to every
    // later one.
    const first = await next.render$('/on-demand/fresh', undefined, {
      headers: { cookie: 'theme=dark; banner=first' },
    })

    expect(first('#theme').text()).toBe('dark')
    expect(first('#banner').last().text()).toBe('first')

    const second = await next.render$('/on-demand/fresh', undefined, {
      headers: { cookie: 'theme=dark; banner=second' },
    })

    expect(second('#theme').text()).toBe('dark')
    expect(second('#banner').last().text()).toBe('second')
  })

  it('should resolve a combination that was never declared', async () => {
    // `shell/[slug]` declares only `locale=en`, so this combination has no
    // prerender from the build. The proxy still resolved it, so a shell for it
    // is generated on demand rather than another combination's being served.
    const $ = await next.render$('/shell/undeclared', undefined, {
      headers: { cookie: 'theme=dark; locale=de' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('de')
    expect($('#slug').last().text()).toBe('undeclared')
  })

  it('should not let a client name the combination it is served', async () => {
    // The prefix names an artifact, and the proxy writes it from what `decide`
    // resolved. Supplying one directly would let a client pick its own
    // combination, which for a variant the server decides is exactly what the
    // variant exists to prevent. A path nobody was routed to therefore names
    // nothing.
    const declared = hashVariants({
      'locale@variants.ts': 'en',
      'theme@variants.ts': 'light',
    })

    const chosen = await next.fetch(`/__variants/${declared}/enumerated/a`, {
      headers: { cookie: 'theme=dark; locale=en' },
    })

    expect(chosen.status).toBe(404)

    // And one that names no combination at all must not reach the route either,
    // or every value invents a cache entry of its own.
    const invented = await next.fetch('/__variants/zzzzz/enumerated/a', {
      headers: { cookie: 'theme=dark; locale=en' },
    })

    expect(invented.status).toBe(404)
  })

  it('should not let a client name the combination through the query parameter', async () => {
    // The router changes the prefix into a query parameter before the origin
    // matches a route. The parameter therefore has the authority of the prefix,
    // and a client must not be able to set it. The router writes the parameter
    // only after the proxy runs. Thus a parameter that arrives came from the
    // client, and it names nothing, for the same reason that a supplied prefix
    // names nothing.
    const declared = hashVariants({
      'locale@variants.ts': 'en',
      'theme@variants.ts': 'light',
    })

    // These cookies resolve a combination that nobody declared. The proxy
    // writes no prefix for such a request. A supplied parameter would then be
    // the only one present, which is the case where a client could otherwise
    // name a combination.
    const undeclared = await next.fetch(
      `/enumerated/a?${NEXT_VARIANTS_QUERY_PARAM}=${declared}`,
      { headers: { cookie: 'theme=dark; locale=de' } }
    )

    expect(undeclared.status).toBe(404)

    // These cookies resolve a combination that the build declared. A supplied
    // parameter would then be present next to the value that the router wrote.
    const alongsideMatched = await next.fetch(
      `/enumerated/a?${NEXT_VARIANTS_QUERY_PARAM}=${declared}`,
      { headers: { cookie: 'theme=dark; locale=en' } }
    )

    expect(alongsideMatched.status).toBe(404)
  })

  it('should not expose the internal combination query parameter to the page', async () => {
    // The combination travels to the origin as a query parameter, because that
    // is the one channel both a routed request and one a platform rebuilt from
    // an artifact arrive on. It names no param and is not the page's to see, so
    // it must not reach `searchParams` the way a real query value does.
    const $ = await next.render$('/search-params?q=1', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#search-params').last().text()).toBe('q')
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
    const $ = await next.render$('/enumerated/a', undefined, {
      headers: { cookie: 'theme=dark; locale=de' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('de')
    expect($('#slug').text()).toBe('a')
  })

  // The other origin is a server on this machine's loopback interface, which a
  // deployment cannot reach, so this one is inherently self-hosted.
  if (!isNextDeploy) {
    it('should not decorate a rewrite to another origin', async () => {
      const $ = await next.render$('/external')

      expect($('#external').text()).toBe('external')
      // A decorated destination would arrive as `/__variants/<hash>/external`,
      // which the other origin knows nothing about and would not strip.
      expect(externalServer.getReceivedUrls()).toEqual(['/external'])
    })
  }
})
