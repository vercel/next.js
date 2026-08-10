import http from 'http'
import cheerio from 'cheerio'
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { findPort } from 'next-test-utils'

describe('Fetch polyfill', () => {
  let apiServerPort: number
  let apiServer: http.Server

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      react: '19.3.0-canary-fef12a01-20260413',
      'react-dom': '19.3.0-canary-fef12a01-20260413',
    },
    // Vercel deployment fails to build/deploy this fixture in CI; skip in deploy mode.
    skipDeployment: true,
  })
  if (skipped) return

  beforeAll(async () => {
    apiServerPort = await findPort()

    apiServer = http.createServer((req, res) => {
      if (req.url === '/usernames') {
        return res.end(JSON.stringify({ usernames: ['a', 'b'] }))
      }
      if (req.url === '/usernames/a') {
        return res.end(JSON.stringify({ from: 'a' }))
      }
      if (req.url === '/usernames/b') {
        return res.end(JSON.stringify({ from: 'b' }))
      }
      res.end(JSON.stringify({ foo: 'bar' }))
    })

    await new Promise<void>((resolve, reject) => {
      apiServer.listen(apiServerPort, () => resolve())
      apiServer.once('error', reject)
    })

    next.env.NEXT_PUBLIC_API_PORT = String(apiServerPort)

    if (!isNextDev) {
      await next.build()
    }
    await next.start()
  })

  afterAll(() => {
    apiServer?.close()
  })

  it('includes polyfilled fetch when using getStaticProps', async () => {
    const html = await next.render('/static')
    expect(html).toMatch(/bar/)
  })

  it('includes polyfilled fetch when using getServerSideProps', async () => {
    const html = await next.render('/ssr')
    expect(html).toMatch(/bar/)
  })

  it('includes polyfilled fetch when using getInitialProps', async () => {
    const html = await next.render('/getinitialprops')
    expect(html).toMatch(/bar/)
  })

  it('includes polyfilled fetch when using API routes', async () => {
    const res = await next.fetch('/api/api-route')
    const json = await res.json()
    expect(json.foo).toBe('bar')
  })

  it('includes polyfilled fetch when using getStaticPaths', async () => {
    const htmlA = await next.render('/user/a')
    const $a = cheerio.load(htmlA)
    expect($a('#username').text()).toBe('a')

    const htmlB = await next.render('/user/b')
    const $b = cheerio.load(htmlB)
    expect($b('#username').text()).toBe('b')
  })
})
