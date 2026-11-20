import { nextTestSetup } from 'e2e-utils'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// Vercel deployment fails to build/deploy this fixture in CI; skip in deploy mode.
// @force-gate !deploy
describe('fetch-keep-alive', () => {
  let mockServer: Server

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    mockServer = createServer((req, res) => {
      const { connection } = req.headers
      res.end(JSON.stringify({ connection }))
    })
    await new Promise<void>((resolve, reject) => {
      mockServer.once('error', reject)
      mockServer.listen(0, '127.0.0.1', resolve)
    })
    next.env.TEST_SERVER_URL = `http://127.0.0.1:${(mockServer.address() as AddressInfo).port}`
    await next.start()
  })

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>((resolve, reject) => {
        mockServer.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('should send keep-alive for json API', async () => {
    const res = await next.fetch('/api/json')
    const obj = await res.json()
    expect(obj).toEqual({ connection: 'keep-alive' })
  })

  it('should send keep-alive for getStaticProps', async () => {
    const browser = await next.browser('/ssg')
    const props = await browser.elementById('props').text()
    const obj = JSON.parse(props)
    expect(obj).toEqual({ connection: 'keep-alive' })
  })

  it('should send keep-alive for getStaticPaths', async () => {
    const browser = await next.browser('/blog/first')
    const props = await browser.elementById('props').text()
    const obj = JSON.parse(props)
    expect(obj).toEqual({ slug: 'first' })
  })

  it('should send keep-alive for getServerSideProps', async () => {
    const browser = await next.browser('/ssr')
    const props = await browser.elementById('props').text()
    const obj = JSON.parse(props)
    expect(obj).toEqual({ connection: 'keep-alive' })
  })
})
