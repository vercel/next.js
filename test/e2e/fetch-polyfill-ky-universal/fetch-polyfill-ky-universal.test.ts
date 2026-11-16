import { join } from 'path'
import { nextTestSetup, isNextStart } from 'e2e-utils'
import { findPort, initNextServerScript, killApp } from 'next-test-utils'

// Deploy mode exclusion: This suite starts an HTTP server on a local port and
// patches that port into next.config.js, which a deployment can't reach.
// @force-gate !deploy
describe('Fetch polyfill with ky-universal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { 'ky-universal': '0.6.0', ky: '0.19.1' },
  })

  let apiServerPort: number
  let apiServer: any

  beforeAll(async () => {
    const scriptPath = join(__dirname, 'api-server.js')
    apiServerPort = await findPort()
    apiServer = await initNextServerScript(
      scriptPath,
      /ready on/i,
      { ...process.env, PORT: String(apiServerPort) },
      /ReferenceError: options is not defined/
    )

    next.env.NEXT_PUBLIC_API_PORT = String(apiServerPort)
    if (isNextStart) {
      await next.build()
    }
    await next.start()
  })

  afterAll(async () => {
    await killApp(apiServer)
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
})
