import { nextTestSetup } from 'e2e-utils'

type RecordedSpan = { name: string; attributes: Record<string, unknown> }

// The OpenTelemetry API is the largest module the tracer loads. A server that
// registers nothing with the API must not load it, and must still trace as
// soon as a tracer provider is registered.
describe('opentelemetry-api-on-demand', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Serves the routes by calling the handler of each route's server entry,
    // like a deployment adapter does. The server process then loads only what
    // the requested routes load.
    startCommand: 'node minimal-server.js',
    serverReadyPattern: /minimal server ready/,
  })

  async function fetchJson<T>(path: string, method = 'GET'): Promise<T> {
    const res = await next.fetch(path, { method })
    expect(res.status).toBe(200)
    return res.json()
  }

  // This test must run first: the next one registers a tracer provider.
  it('should not load the OpenTelemetry API while nothing is registered with it', async () => {
    // Render a page, so the server has traced a request.
    expect(await next.render('/')).toContain('hello world')

    const loaded = await fetchJson<string[]>('/api/loaded-modules')

    // If the tracer is renamed or stops being a separate file, the check below
    // would pass for the wrong reason.
    expect(loaded).toContain('next/dist/server/lib/trace/tracer.js')

    expect(loaded.filter((id) => id.includes('/@opentelemetry/api/'))).toEqual(
      []
    )
  })

  it('should trace requests once a tracer provider is registered', async () => {
    expect(await next.render('/')).toContain('hello world')
    expect(await fetchJson<RecordedSpan[]>('/api/tracing')).toEqual([])

    await fetchJson('/api/tracing', 'POST')
    expect(await next.render('/')).toContain('hello world')

    const spans = await fetchJson<RecordedSpan[]>('/api/tracing')
    expect(spans).toContainEqual(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'next.span_type': 'BaseServer.handleRequest',
          'http.method': 'GET',
          'http.target': '/',
        }),
      })
    )
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'getServerSideProps /',
        attributes: expect.objectContaining({
          'next.span_type': 'Render.getServerSideProps',
        }),
      })
    )
  })
})
