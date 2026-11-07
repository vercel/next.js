import { nextTestSetup } from 'e2e-utils'

type RecordedSpan = { name: string; attributes: Record<string, unknown> }

const routes = [
  ['a Pages Router page', '/', 'hello world'],
  ['an App Router route handler', '/route-handler', 'app router'],
  ['an App Router page', '/dynamic-page', 'hello app router'],
]

// The OpenTelemetry API is the largest module the tracer loads. A server that
// registers nothing with the API must not load it, and must still trace as
// soon as a tracer provider is registered.
describe.each([
  ['next start', {}],
  [
    // Serves the routes by calling the handler of each route's server entry.
    // The server process then loads only what the requested routes load.
    'route entries',
    {
      startCommand: 'node minimal-server.js',
      serverReadyPattern: /minimal server ready/,
    },
  ],
])('opentelemetry-api-on-demand (%s)', (_server, options) => {
  const { next } = nextTestSetup({
    files: __dirname,
    ...options,
  })

  async function fetchJson<T>(path: string, method = 'GET'): Promise<T> {
    const res = await next.fetch(path, { method })
    expect(res.status).toBe(200)
    return res.json()
  }

  // These tests must run first: the last test registers a tracer provider.
  it.each(routes)(
    'should not load the OpenTelemetry API for %s while nothing is registered with it',
    async (_name, path, content) => {
      // Handle a request, so the server has traced it.
      expect(await next.render(path)).toContain(content)

      const loaded = await fetchJson<string[]>('/api/loaded-modules')

      // If the tracer is renamed or stops being a separate file, the check
      // below would pass for the wrong reason.
      expect(loaded).toContain('next/dist/server/lib/trace/tracer.js')

      expect(
        loaded.filter((id) => id.includes('/@opentelemetry/api/'))
      ).toEqual([])
    }
  )

  it('should trace requests once a tracer provider is registered', async () => {
    for (const [, path, content] of routes) {
      expect(await next.render(path)).toContain(content)
    }
    expect(await fetchJson<RecordedSpan[]>('/api/tracing')).toEqual([])

    await fetchJson('/api/tracing', 'POST')
    for (const [, path, content] of routes) {
      expect(await next.render(path)).toContain(content)
    }

    const spans = await fetchJson<RecordedSpan[]>('/api/tracing')
    for (const [, path] of routes) {
      expect(spans).toContainEqual(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'next.span_type': 'BaseServer.handleRequest',
            'http.method': 'GET',
            'http.target': path,
          }),
        })
      )
    }
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'getServerSideProps /',
        attributes: expect.objectContaining({
          'next.span_type': 'Render.getServerSideProps',
        }),
      })
    )
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'render route (app) /dynamic-page',
        attributes: expect.objectContaining({
          'next.span_type': 'AppRender.getBodyResult',
        }),
      })
    )
  })
})
