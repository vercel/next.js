import { join } from 'path'
import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { findPort, initNextServerScript, killApp } from 'next-test-utils'

describe('Fetch polyfill with ky-universal', () => {
  ;(isNextDev ? describe : describe.skip)('development mode', () => {
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
      await next.start()
    })

    afterAll(async () => {
      await killApp(apiServer)
    })

    it('includes polyfilled fetch when using getStaticProps (dev)', async () => {
      const html = await next.render('/static')
      expect(html).toMatch(/bar/)
    })

    it('includes polyfilled fetch when using getServerSideProps (dev)', async () => {
      const html = await next.render('/ssr')
      expect(html).toMatch(/bar/)
    })

    it('includes polyfilled fetch when using getInitialProps (dev)', async () => {
      const html = await next.render('/getinitialprops')
      expect(html).toMatch(/bar/)
    })
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
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
      await next.build()
      await next.start()
    })

    afterAll(async () => {
      await killApp(apiServer)
    })

    it('includes polyfilled fetch when using getStaticProps (prod)', async () => {
      const html = await next.render('/static')
      expect(html).toMatch(/bar/)
    })

    it('includes polyfilled fetch when using getServerSideProps (prod)', async () => {
      const html = await next.render('/ssr')
      expect(html).toMatch(/bar/)
    })

    it('includes polyfilled fetch when using getInitialProps (prod)', async () => {
      const html = await next.render('/getinitialprops')
      expect(html).toMatch(/bar/)
    })
  })
})
