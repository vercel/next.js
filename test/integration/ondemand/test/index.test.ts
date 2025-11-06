/* eslint-env jest */
import { join } from 'path'
import webdriver from 'next-webdriver'
import getPort from 'get-port'
import {
  renderViaHTTP,
  killApp,
  waitFor,
  check,
  getBrowserBodyText,
  getPageFileFromBuildManifest,
  getBuildManifest,
  initNextServerScript,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')

const startServer = async (optEnv = {}, opts?: any) => {
  const scriptPath = join(appDir, 'server.js')
  appPort = await getPort()
  const env = Object.assign({ ...process.env }, { PORT: `${appPort}` }, optEnv)

  app = await initNextServerScript(scriptPath, /ready on/i, env)
}

// Tests are skipped in Turbopack because they are not relevant to Turbopack.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'On Demand Entries',
  () => {
    it('should pass', () => {})
    const originalIsNextDev = global.isNextDev
    beforeAll(async () => {
      // The server.js sets "dev" via process.env.NODE_ENV.
      // isNextDev is used for getDistDir, where it is used for reading the build manifest files.
      global.isNextDev = process.env.NODE_ENV !== 'production'
      await startServer()
    })
    afterAll(async () => {
      global.isNextDev = originalIsNextDev
      await killApp(app)
    })

    it('should compile pages for SSR', async () => {
      // The buffer of built page uses the on-demand-entries-ping to know which pages should be
      // buffered. Therefore, we need to double each render call with a ping.
      const pageContent = await renderViaHTTP(appPort, '/')
      expect(pageContent.includes('Index Page')).toBeTrue()
    })

    it('should compile pages for JSON page requests', async () => {
      await renderViaHTTP(appPort, '/about')
      const pageFile = getPageFileFromBuildManifest(appDir, '/about')
      const pageContent = await renderViaHTTP(appPort, join('/_next', pageFile))
      expect(pageContent.includes('About Page')).toBeTrue()
    })

    it('should dispose inactive pages', async () => {
      await renderViaHTTP(appPort, '/')

      // Render two pages after the index, since the server keeps at least two pages
      await renderViaHTTP(appPort, '/about')

      await renderViaHTTP(appPort, '/third')

      // Wait maximum of jest.setTimeout checking
      // for disposing /about
      for (let i = 0; i < 30; ++i) {
        await waitFor(1000 * 1)
        try {
          const buildManifest = getBuildManifest(appDir)
          // Assert that the two lastly demanded page are not disposed
          expect(buildManifest.pages['/']).toBeUndefined()
          expect(buildManifest.pages['/about']).toBeDefined()
          expect(buildManifest.pages['/third']).toBeDefined()
          return
        } catch (err) {
          continue
        }
      }
    })

    it('should navigate to pages with dynamic imports', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/nav')

        await browser.eval('document.getElementById("to-dynamic").click()')

        await check(async () => {
          const text = await getBrowserBodyText(browser)
          return text
        }, /Hello/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  }
)
