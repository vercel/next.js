import { createNextDescribe } from 'e2e-utils'
import { sleep } from './sleep'
import { get } from 'http'

createNextDescribe(
  'streaming responses cancel inner stream after disconnect',
  {
    files: __dirname,
  },
  ({ next }) => {
    type CancelState = {
      requestAborted: boolean
      streamCleanedUp: boolean
      i: number
    }

    function prime(url: string) {
      return new Promise<void>((resolve) => {
        url = new URL(url, next.url).href

        // There's a bug in node-fetch v2 where aborting the fetch will never abort
        // the connection, because the body is a transformed stream that doesn't
        // close the connection stream.
        // https://github.com/node-fetch/node-fetch/pull/670
        const req = get(url, async (res) => {
          while (true) {
            const value = res.read(1)
            if (value) break
            await sleep(5)
          }

          res.destroy()

          // make sure the connection has finished
          await sleep(100)

          resolve()
        })
        req.end()
      })
    }

    // The disconnect from our prime request to the server isn't instant, and
    // there's no good signal on the client end for when it happens. So we just
    // fetch multiple times waiting for it to happen.
    async function getTillCancelled(url: string) {
      while (true) {
        const res = await next.fetch(url)
        const json = (await res.json()) as CancelState
        if (json.streamCleanedUp === true) {
          return json
        }

        await sleep(10)
      }
    }

    it('Midddleware cancels inner ReadableStream', async () => {
      await prime('/middleware')
      const json = await getTillCancelled('/middleware')
      expect(json).toMatchObject({
        requestAborted: true,
        streamCleanedUp: true,
        i: (expect as any).toBeWithin(0, 5),
      })
    })

    it('App Route Handler Edge cancels inner ReadableStream', async () => {
      await prime('/edge-route')
      const json = await getTillCancelled('/edge-route')
      expect(json).toMatchObject({
        requestAborted: true,
        streamCleanedUp: true,
        i: (expect as any).toBeWithin(0, 5),
      })
    })

    it('App Route Handler NodeJS cancels inner ReadableStream', async () => {
      await prime('/node-route')
      const json = await getTillCancelled('/node-route')
      expect(json).toMatchObject({
        requestAborted: true,
        streamCleanedUp: true,
        i: (expect as any).toBeWithin(0, 5),
      })
    })

    it('Pages Api Route Edge cancels inner ReadableStream', async () => {
      await prime('/api/edge-api')
      const json = await getTillCancelled('/api/edge-api')
      expect(json).toMatchObject({
        requestAborted: true,
        streamCleanedUp: true,
        i: (expect as any).toBeWithin(0, 5),
      })
    })

    it('Pages Api Route NodeJS cancels inner ReadableStream', async () => {
      await prime('/api/node-api')
      const json = await getTillCancelled('/api/node-api')
      expect(json).toMatchObject({
        requestAborted: true,
        streamCleanedUp: true,
        i: (expect as any).toBeWithin(0, 5),
      })
    })
  }
)
