import { findPort, waitFor } from 'next-test-utils'
import http from 'http'
import { outdent } from 'outdent'
import { FileRef, createNext } from 'e2e-utils'

describe('app-fetch-deduping', () => {
  if ((global as any).isNextStart) {
    describe('during static generation', () => {
      let externalServerPort: number
      let externalServer: http.Server
      let requests = []

      beforeAll(async () => {
        externalServerPort = await findPort()
        externalServer = http.createServer((req, res) => {
          requests.push(req.url)
          res.end(`Request ${req.url} received at ${Date.now()}`)
        })

        await new Promise<void>((resolve, reject) => {
          externalServer.listen(externalServerPort, () => {
            resolve()
          })

          externalServer.once('error', (err) => {
            reject(err)
          })
        })
      })

      beforeEach(() => {
        requests = []
      })

      afterAll(() => externalServer.close())

      it('dedupes requests amongst static workers when experimental.staticWorkerRequestDeduping is enabled', async () => {
        const next = await createNext({
          files: new FileRef(__dirname),
          env: { TEST_SERVER_PORT: `${externalServerPort}` },
          nextConfig: {
            experimental: {
              staticWorkerRequestDeduping: true,
            },
          },
        })

        expect(requests.length).toBe(1)

        await next.destroy()
      })
    })
  } else if ((global as any).isNextDev) {
    describe('during next dev', () => {
      it('should dedupe requests called from the same component', async () => {
        const next = await createNext({
          files: new FileRef(__dirname),
        })

        await next.patchFile(
          'app/test/page.tsx',
          outdent`
          async function getTime() {
            const res = await fetch("http://localhost:${next.appPort}/api/time")
            return res.text()
          }
          
          export default async function Home() {
            await getTime()
            await getTime()
            const time = await getTime()
          
            return <h1>{time}</h1>
          }
        `
        )

        await next.render('/test')

        let count = next.cliOutput.split('Starting...').length - 1
        expect(count).toBe(1)

        await next.destroy()
      })

      it('should dedupe pending revalidation requests', async () => {
        const next = await createNext({
          files: new FileRef(__dirname),
        })

        await next.patchFile(
          'app/test/page.tsx',
          outdent`
          async function getTime() {
            const res = await fetch("http://localhost:${next.appPort}/api/time", { next: { revalidate: 5 } })
            return res.text()
          }
          
          export default async function Home() {
            await getTime()
            await getTime()
            const time = await getTime()
          
            return <h1>{time}</h1>
          }
        `
        )

        await next.render('/test')

        let count = next.cliOutput.split('Starting...').length - 1
        expect(count).toBe(1)

        const outputIndex = next.cliOutput.length

        // wait for the revalidation to finish
        await waitFor(6000)

        await next.render('/test')

        count =
          next.cliOutput.slice(outputIndex).split('Starting...').length - 1
        expect(count).toBe(1)

        await next.destroy()
      })
    })
  } else {
    it('should skip other scenarios', () => {})
    return
  }
})
