import { nextTestSetup } from 'e2e-utils'
import { sleep } from './sleep'
import { request } from 'http'

describe('streaming responses cancel inner stream after disconnect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function prime(
    url: string,
    noData?: boolean,
    init: { method?: string; body?: string } = {}
  ) {
    return new Promise<void>((resolve, reject) => {
      url = new URL(url, next.url).href
      const { method = 'GET', body } = init
      const headers = body
        ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          }
        : undefined
      let abortTimer: ReturnType<typeof setTimeout> | undefined

      // There's a bug in node-fetch v2 where aborting the fetch will never abort
      // the connection, because the body is a transformed stream that doesn't
      // close the connection stream.
      // https://github.com/node-fetch/node-fetch/pull/670
      const req = request(url, { method, headers }, async (res) => {
        if (noData) {
          if (abortTimer) {
            clearTimeout(abortTimer)
          }

          res.destroy()
          resolve()
          return
        }

        while (true) {
          const value = res.read(1)
          if (value) break
          await sleep(5)
        }

        res.destroy()
        resolve()
      })
      req.on('error', reject)

      if (noData) {
        req.on('error', (e) => {
          // Swallow the "socket hang up" message that happens if you abort
          // before the a response connection is received.
          if ((e as any).code !== 'ECONNRESET') {
            throw e
          }
        })

        abortTimer = setTimeout(() => {
          req.abort()
          resolve()
        }, 100)
      }

      if (body) {
        req.write(body)
      }

      req.end()
    })
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

  describe.each([
    ['edge app route handler', '/edge-route'],
    ['node app route handler', '/node-route'],
  ])('%s', (_name, path) => {
    beforeAll(async () => {
      await next.fetch(path + '?compile', {
        method: 'POST',
        body: '{}',
      })
    })

    it('does not log aborted POST stream responses as uncaught exceptions', async () => {
      const outputStart = next.cliOutput.length

      await prime(path + '?sse', true, {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      })
      await sleep(500)

      const newOutput = next.cliOutput.slice(outputStart)
      expect(newOutput).not.toContain('uncaughtException')
      expect(newOutput).not.toContain('ECONNRESET')
      expect(newOutput).not.toContain('Error: aborted')
    }, 2500)
  })
})
