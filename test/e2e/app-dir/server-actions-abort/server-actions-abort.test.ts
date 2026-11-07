import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { request as httpRequest } from 'http'

describe('server-actions-abort', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getState() {
    const res = await next.fetch('/api/state')
    return res.json() as Promise<{
      started: boolean
      aborted: boolean
      completed: boolean
    }>
  }

  it('aborts a running server action when the client disconnects', async () => {
    // Use the browser to produce a valid Server Action request (correct
    // `next-action` id, origin and encoded body), but intercept it so it never
    // hits the server. We replay it ourselves over a raw socket below so we can
    // deterministically drop the connection mid-flight, exactly like a client
    // aborting via `AbortController`.
    let captured: {
      url: string
      headers: Record<string, string>
      body: string
    } | null = null

    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.route(/.*/, async (route) => {
          const request = route.request()
          const headers = await request.allHeaders()
          if (request.method() === 'POST' && headers['next-action']) {
            captured = {
              url: request.url(),
              headers,
              body: request.postData() ?? '',
            }
            await route.abort()
          } else {
            await route.continue()
          }
        })
      },
    })

    await browser.elementById('start').click()

    await retry(async () => {
      expect(captured).not.toBeNull()
    })

    // Replay the action request over a raw connection we control.
    const url = new URL(captured!.url)
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(captured!.headers)) {
      // Drop HTTP/2 pseudo-headers and let node recompute the length.
      if (!key.startsWith(':') && key !== 'content-length') {
        headers[key] = value
      }
    }

    const req = httpRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers,
    })
    // Swallow the connection-reset error caused by destroying the socket.
    req.on('error', () => {})
    req.on('response', (res) => {
      res.on('error', () => {})
      res.resume()
    })
    req.end(captured!.body)

    // Wait until the action has actually started executing on the server.
    await retry(async () => {
      const state = await getState()
      expect(state.started).toBe(true)
      expect(state.completed).toBe(false)
    })

    // Simulate the client cancelling the request by dropping the connection.
    req.destroy()

    // The server action should observe the abort signal and stop early, rather
    // than running to completion. Without propagating the abort signal to the
    // action, `aborted` never becomes true.
    await retry(async () => {
      const state = await getState()
      expect(state.aborted).toBe(true)
    })

    expect((await getState()).completed).toBe(false)

    await browser.close()
  })
})
