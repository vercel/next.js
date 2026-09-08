import { nextTestSetup } from 'e2e-utils'

describe('streaming responses cancel inner stream after disconnect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function prime(url: string, noData?: boolean) {
    url = new URL(url, next.url).href

    const controller = new AbortController()

    if (noData) {
      const promise = fetch(url, { signal: controller.signal })
      setTimeout(() => {
        controller.abort()
      }, 100)

      // Swallow the AbortError that happens if you abort before the
      // response connection is received.
      await promise.catch((err) => {
        if (err.name !== 'AbortError') {
          throw err
        }
      })
      return
    }

    const res = await fetch(url, { signal: controller.signal })
    const reader = res.body!.getReader()
    // Wait for the first byte of the response body, then abort the
    // connection abruptly so the server observes a client disconnect.
    await reader.read()
    controller.abort()
  }

  describe.each([
    ['middleware', '/middleware'],
    ['edge app route handler', '/edge-route'],
    ['node app route handler', '/node-route'],
    ['edge pages api', '/api/edge-api'],
    ['node pages api', '/api/node-api'],
  ])('%s', (_name, path) => {
    beforeAll(async () => {
      // Trigger compilation of the route so that compilation time does not
      // factor into the actual test requests.
      await next.fetch(path + '?compile')
    })

    it('cancels stream making progress', async () => {
      // If the stream is making regular progress, then we'll eventually hit
      // the break because `res.destroyed` is true.
      await prime(path + '?write=25')
      const res = await next.fetch(path)
      const i = await res.text()
      expect(i).toMatch(/\d+/)
    }, 2500)

    it('cancels stalled stream', async () => {
      // If the stream is stalled, we'll never hit the `res.destroyed` break
      // point, so this ensures we handle it with an out-of-band cancellation.
      await prime(path + '?write=1')
      const res = await next.fetch(path)
      const i = await res.text()
      expect(i).toBe('1')
    }, 2500)

    it('cancels stream that never sent data', async () => {
      // If the client has never sent any data (including headers), then we
      // haven't even established the response object yet.
      await prime(path + '?write=0', true)
      const res = await next.fetch(path)
      const i = await res.text()
      expect(i).toBe('0')
    }, 2500)
  })
})
