import { createNextDescribe } from 'e2e-utils'
import { sleep } from './sleep'
import { get } from 'http'

createNextDescribe(
  'streaming responses cancel inner stream after disconnect',
  {
    files: __dirname,
  },
  ({ next }) => {
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
          resolve()
        })
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
      it('cancels stream making progress', async () => {
        const url = path + '?write=25'
        await prime(url)
        const res = await next.fetch(url)
        const i = +(await res.text())
        expect(i).toBeWithin(1, 5)
      }, 2500)

      it('cancels stalled stream', async () => {
        const url = path + '?write=1'
        await prime(url)
        const res = await next.fetch(url)
        const i = +(await res.text())
        expect(i).toBe(1)
      }, 2500)

      it('cancels stream that never sent data', async () => {
        const url = path + '?write=0'
        await prime(url)
        const res = await next.fetch(url)
        const i = +(await res.text())
        expect(i).toBe(0)
      }, 2500)
    })
  }
)
