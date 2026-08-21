import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

import { basePath, url } from './base-path'
import { startExternalServer } from './external-server.mjs'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    // TODO(variants): a platform serves a variant from its build output, which
    // comes later. No test here depends on that, because every read below
    // happens at request time.
    skipDeployment: true,
    // The harness forwards only what goes through `env`, so the value reaches a
    // deployed build as well as a local one.
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

  it('should resolve several variants from one request', async () => {
    const $ = await next.render$(url('/'), undefined, {
      headers: { cookie: 'theme=dark; locale=de' },
    })

    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('de')
  })

  it('should not expose the resolved values to the client', async () => {
    const response = await next.fetch(url('/'), {
      headers: { cookie: 'theme=dark' },
    })

    // The values reach the origin as a request header, so the response does not
    // carry them back to the client.
    expect(response.headers.get('x-next-internal-variants')).toBeNull()
  })

  it('should resolve a variant on the route the proxy rewrote to', async () => {
    const $ = await next.render$(url('/rewrite-source'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    // The rewrite decides which route renders. The variants of
    // `/rewrite-target` therefore apply, and not those of the source.
    expect($('#theme').text()).toBe('dark')
    expect($('#locale').text()).toBe('en')
  })

  it('should not send resolved values to another origin', async () => {
    const $ = await next.render$(url('/external'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#external').text()).toBe('external')

    const received = externalServer.getReceivedRequests()

    expect(received).toHaveLength(1)
    expect(received[0].url).toBe('/external')

    // The other origin renders no route of this application, and it does not
    // remove an internal header. The proxy therefore drops the values.
    expect(received[0].headers['x-next-internal-variants']).toBeUndefined()
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
})
