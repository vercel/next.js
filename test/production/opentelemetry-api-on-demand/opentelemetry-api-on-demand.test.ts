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
])('opentelemetry-api-on-demand (%s)', (server, options) => {
  const { next } = nextTestSetup({
    files: __dirname,
    ...options,
  })

  async function fetchJson<T>(path: string, method = 'GET'): Promise<T> {
    const res = await next.fetch(path, { method })
    expect(res.status).toBe(200)
    return res.json()
  }

  // The loaded files don't show a copy of the API that is bundled into a
  // chunk. The server for the route entries counts every evaluation of the API.
  const countsApiEvaluations = server === 'route entries'

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

      if (countsApiEvaluations) {
        expect(await fetchJson('/api-evaluations')).toBe(0)
      }
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

    if (countsApiEvaluations) {
      // If the count stops working, the checks above pass for the wrong reason.
      expect(await fetchJson('/api-evaluations')).toBeGreaterThan(0)
    }
  })
})

// Once a tracer provider is registered, the API is going to be used. A route
// entry that the server loads after that must load the API as it is loaded,
// and not leave it to the first request to the route.
describe('opentelemetry-api-on-demand (tracer provider registered before the route entries are loaded)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // With the package installed, the route entries bundle their own copies of
    // the API.
    dependencies: { '@opentelemetry/api': '^1.9.0' },
    startCommand: 'node minimal-server.js',
    serverReadyPattern: /minimal server ready/,
    env: { REGISTER_TRACER_PROVIDER: '1' },
  })

  async function fetchApiEvaluations(): Promise<number> {
    const res = await next.fetch('/api-evaluations')
    expect(res.status).toBe(200)
    return res.json()
  }

  it('should load the OpenTelemetry API with the route entries, not in the first request to a route', async () => {
    const evaluations = await fetchApiEvaluations()
    // The package that the server registered the tracer provider with, and
    // the copies of the route entries.
    expect(evaluations).toBeGreaterThan(1)

    for (const [, path, content] of routes) {
      expect(await next.render(path)).toContain(content)
    }

    expect(await fetchApiEvaluations()).toBe(evaluations)
  })
})
