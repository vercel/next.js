import { nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'

import { startExternalServer } from './external-server.mjs'

describe('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
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

  it('should not decorate a rewrite to another origin', async () => {
    const $ = await next.render$('/external')

    expect($('#external').text()).toBe('external')
    // A decorated destination would arrive as `/__variants/<packed>/external`,
    // which the other origin knows nothing about and would not strip.
    expect(externalServer.getReceivedUrls()).toEqual(['/external'])
  })
})
