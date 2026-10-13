import { nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'

// The fixture fetches from a data server that this test runs on localhost,
// which a deployment can't reach.
// @force-gate !deploy
describe('fetch-shared-options', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Origin hits per key. Each response includes its hit number, so a fetch
  // that isn't served from the cache changes the rendered text.
  const hits = new Map<string, number>()
  let server: ReturnType<typeof createTestDataServer> | undefined

  beforeAll(async () => {
    const dataServer = createTestDataServer((key) => {
      const hit = (hits.get(key) ?? 0) + 1
      hits.set(key, hit)
      return `${key}:${hit}`
    })
    server = dataServer
    const port = await findPort()
    // Wait for the server to bind, so a port conflict fails the suite instead
    // of crashing the test worker with an unhandled 'error' event.
    await new Promise<void>((resolve, reject) => {
      dataServer._server.once('error', reject)
      dataServer._server.once('listening', () => resolve())
      dataServer.listen(port)
    })

    // Set before the build, which prerenders the page in start mode.
    next.env.TEST_DATA_SERVICE_URL = `http://localhost:${port}`
    await next.start()
  })

  afterAll(() => {
    server?.close()
  })

  it('should keep caching fetches that reuse the same options object', async () => {
    const $ = await next.render$('/')

    // Fetching must not change the options object that both fetches share.
    expect($('#options').text()).toBe(
      JSON.stringify({ next: { revalidate: 3600, tags: ['shared'] } })
    )

    // Both fetches reached the origin: during the build in start mode, or
    // during this request in dev.
    const first = $('#first').text()
    const second = $('#second').text()
    expect(first).toMatch(/^first:\d+$/)
    expect(second).toMatch(/^second:\d+$/)
    const originHits = Object.fromEntries(hits)
    expect(Object.keys(originHits).sort()).toEqual(['first', 'second'])

    // Both fetches are cached, so later requests don't reach the origin. In
    // dev this means the fetch cache is hit. When prerendering, the build fails
    // instead if a fetch loses its cache config.
    for (let i = 0; i < 2; i++) {
      const $next = await next.render$('/')
      expect($next('#first').text()).toBe(first)
      expect($next('#second').text()).toBe(second)
    }
    expect(Object.fromEntries(hits)).toEqual(originHits)
  })
})
