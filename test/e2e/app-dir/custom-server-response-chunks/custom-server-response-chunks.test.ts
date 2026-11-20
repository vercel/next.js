import { nextTestSetup } from 'e2e-utils'
import { text } from './data'

type RecordedRequest = {
  url: string
  rsc: string | undefined
  status: number
  chunks: string[]
}

// A custom server (server.js) is not supported in deploy mode.
// @force-gate !deploy
describe('custom-server-response-chunks', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /Next mode: (production|development)/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  async function recordedRequests(): Promise<RecordedRequest[]> {
    const res = await next.fetch('/__requests')
    return res.json()
  }

  it('writes no string chunks to the HTML response', async () => {
    const html = await next.render('/')
    expect(html).toContain(text)

    const requests = await recordedRequests()
    const request = requests.find((r) => r.url === '/' && r.status === 200)
    expect(request.chunks.length).toBeGreaterThan(0)
    expect(request.chunks).not.toContain('string')
  })

  it('writes no string chunks to the RSC response', async () => {
    const res = await next.fetch('/', { headers: { RSC: '1' } })
    expect(res.headers.get('content-type')).toBe('text/x-component')
    expect(await res.text()).toContain(text)

    const requests = await recordedRequests()
    const request = requests.find((r) => r.rsc === '1' && r.status === 200)
    expect(request.chunks.length).toBeGreaterThan(0)
    expect(request.chunks).not.toContain('string')
    if (!isNextDev) {
      // Production pipes the Flight stream to the response directly. The dev
      // server goes through a Web stream, which hands out plain Uint8Arrays.
      expect(new Set(request.chunks)).toEqual(new Set(['buffer']))
    }
  })
})
