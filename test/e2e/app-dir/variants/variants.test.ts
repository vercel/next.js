import { isNextStart, nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'

import { startExternalServer } from './external-server.mjs'

describe('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    // The proxy rewrites to an internal `/__variants/<packed>` path, which the
    // Next.js router strips before it matches a route. Deployments route at the
    // CDN instead, and the build output declares nothing for that prefix, so
    // the rewritten request resolves to the 404 route. Enable once the build
    // output carries the prefix.
    skipDeployment: true,
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

  if (isNextStart) {
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

  it('should resolve variants for a param that was never enumerated', async () => {
    // `c` has no `generateStaticParams` row, so it is generated on demand. The
    // proxy has still resolved a combination for the request, and generation
    // specializes on it the same way it specializes on params, rather than
    // finding no value and bailing out of the render.
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

  // An undeclared combination is hashed into the path as though it had been
  // declared, so it finds no prerender and the route is generated on demand.
  // `enumerated/[slug]` awaits its param at the top level with no boundary
  // above it, and that generation supplies the param as runtime data, which
  // such a read cannot survive: the request fails with "uncached or runtime
  // data during prerendering". The fix is for an undeclared variant to stop
  // partitioning the cache, so a combination like this one resolves to a
  // variant-agnostic prerender instead of looking for one of its own.
  //
  // Only prerendering under Cache Components reaches that state. Without Cache
  // Components the read interrupts static generation and the route falls back
  // to rendering dynamically, and in dev nothing is prerendered to begin with.
  // `shell/[slug]` is this same case with a boundary above the read, and passes
  // everywhere, which is why the gap went unnoticed.
  const undeclaredCombinationTitle =
    'should resolve an undeclared combination when the param is read without a boundary'

  const undeclaredCombination = async () => {
    const $ = await next.render$('/enumerated/a', undefined, {
      headers: { cookie: 'theme=dark; locale=de' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('de')
    expect($('#slug').text()).toBe('a')
  }

  if (isNextStart && process.env.__NEXT_CACHE_COMPONENTS) {
    it.failing(undeclaredCombinationTitle, undeclaredCombination)
  } else {
    it(undeclaredCombinationTitle, undeclaredCombination)
  }

  it('should not decorate a rewrite to another origin', async () => {
    const $ = await next.render$('/external')

    expect($('#external').text()).toBe('external')
    // A decorated destination would arrive as `/__variants/<packed>/external`,
    // which the other origin knows nothing about and would not strip.
    expect(externalServer.getReceivedUrls()).toEqual(['/external'])
  })
})
