import { findPort, retry } from 'next-test-utils'
import http from 'http'
import url from 'url'
import { outdent } from 'outdent'
import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'

describe('app-fetch-deduping', () => {
  if (isNextStart) {
    describe('during static generation', () => {
      const { next } = nextTestSetup({ files: __dirname, skipStart: true })
      let externalServerPort: number
      let externalServer: http.Server
      let successfulRequests = []

      beforeAll(async () => {
        externalServerPort = await findPort()
        externalServer = http.createServer((req, res) => {
          const parsedUrl = url.parse(req.url, true)
          const overrideStatus = parsedUrl.query.status

          // if the requested url has a "status" search param, override the response status
          if (overrideStatus) {
            res.statusCode = Number(overrideStatus)
          } else {
            successfulRequests.push(req.url)
          }

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
        successfulRequests = []
      })

      afterAll(() => externalServer.close())

      it('dedupes requests amongst static workers', async () => {
        await next.patchFile(
          'next.config.js',
          `module.exports = {
            env: { TEST_SERVER_PORT: "${externalServerPort}" },
          }`
        )
        await next.build()
        expect(successfulRequests.length).toBe(1)
      })
    })
  } else if (isNextDev) {
    describe('during next dev', () => {
      const { next } = nextTestSetup({ files: __dirname, patchFileDelay: 500 })
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
        await retry(async () => {
          await next.render('/test')
          expect(invocation(next.cliOutput)).toBe(2)
        }, 10_000)
      })
    })
  } else {
    it('should skip other scenarios', () => {})
    return
  }
})
