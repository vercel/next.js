import { findPort, waitFor } from 'next-test-utils'
import http from 'http'
import { outdent } from 'outdent'
import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'

describe('app-fetch-deduping', () => {
  if (isNextStart) {
    describe('during static generation', () => {
      const { next } = nextTestSetup({ files: __dirname, skipStart: true })
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
        await next.patchFileFast(
          'next.config.js',
          `module.exports = {
            env: { TEST_SERVER_PORT: "${externalServerPort}" },
            experimental: {
              staticWorkerRequestDeduping: true
            }
          }`
        )
        await next.build()
        expect(requests.length).toBe(1)
      })
    })
  } else if (isNextDev) {
    describe('during next dev', () => {
      const { next } = nextTestSetup({ files: __dirname })
      function invocation(cliOutput: string): number {
        return cliOutput.match(/Route Handler invoked/g).length
      }

      it('should dedupe requests called from the same component', async () => {
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
          }`
        )

        await next.render('/test')

        expect(invocation(next.cliOutput)).toBe(1)
        await next.stop()
      })

      it('should dedupe pending revalidation requests', async () => {
        await next.start()
        const revalidate = 5
        await next.patchFile(
          'app/test/page.tsx',
          outdent`
          async function getTime() {
            const res = await fetch("http://localhost:${next.appPort}/api/time", { next: { revalidate: ${revalidate} } })
            return res.text()
          }
          
          export default async function Home() {
            await getTime()
            await getTime()
            const time = await getTime()
          
            return <h1>{time}</h1>
          }`
        )

        await next.render('/test')

        expect(invocation(next.cliOutput)).toBe(1)

        // wait for the revalidation to finish
        await waitFor(revalidate * 1000 + 1000)

        await next.render('/test')

        expect(invocation(next.cliOutput)).toBe(2)
      })
    })
  } else {
    it('should skip other scenarios', () => {})
    return
  }
})
