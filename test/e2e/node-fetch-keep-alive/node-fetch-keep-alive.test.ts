import { nextTestSetup } from 'e2e-utils'
import { createServer, Server } from 'http'

describe('node-fetch-keep-alive', () => {
  let mockServer: Server

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Vercel deployment fails to build/deploy this fixture in CI; skip in deploy mode.
    skipDeployment: true,
  })
  if (skipped) return

  beforeAll(async () => {
    mockServer = createServer((req, res) => {
      const { connection } = req.headers
      res.end(JSON.stringify({ connection }))
    })
    await new Promise<void>((resolve) => mockServer.listen(44001, resolve))
    await next.start()
  })

  afterAll(() => {
    mockServer?.close()
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
