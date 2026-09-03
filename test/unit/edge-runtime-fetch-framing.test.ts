/**
 * The edge runtime's undici fork must reject hop-by-hop framing headers at the
 * request boundary: forwarding an attacker's Transfer-Encoding alongside
 * undici's own framing enables request smuggling against tolerant upstreams.
 * Matches upstream undici's processHeader behavior.
 */
import { fetch } from 'next/dist/compiled/@edge-runtime/primitives'

describe('edge-runtime fetch framing headers', () => {
  // The header is rejected while the request is being built, so the fetch
  // fails before any connection is attempted; the vendored fetch surfaces the
  // undici error as the cause of its own "fetch failed" TypeError.
  async function expectFramingRejection(
    headers: Record<string, string>,
    message: string
  ) {
    const rejection = await fetch('http://127.0.0.1:8999/', { headers }).then(
      () => ({ error: undefined }),
      (error) => ({ error })
    )
    expect(rejection.error).toBeInstanceOf(TypeError)
    expect((rejection.error as TypeError).message).toBe('fetch failed')
    expect((rejection.error as TypeError).cause).toBeInstanceOf(Error)
    expect(((rejection.error as TypeError).cause as Error).message).toBe(
      message
    )
  }

  it.each(['transfer-encoding', 'keep-alive', 'upgrade'])(
    'rejects a request carrying %s',
    async (header) =>
      expectFramingRejection(
        { [header]: header === 'upgrade' ? 'websocket' : 'chunked' },
        `invalid ${header} header`
      )
  )

  it('rejects a connection token list', async () =>
    expectFramingRejection(
      { connection: 'x-internal-auth, keep-alive' },
      'invalid connection header'
    ))
})
