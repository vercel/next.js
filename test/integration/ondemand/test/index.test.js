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

const appDir = join(__dirname, '../')
const context = {}

const startServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = await getPort()
  const env = Object.assign(
    { ...process.env },
    { PORT: `${context.appPort}` },
    optEnv
  )

  context.server = await initNextServerScript(scriptPath, /ready on/i, env)
}

// Tests are skipped in Turbopack because they are not relevant to Turbopack.
;(process.env.TURBOPACK ? describe.skip : describe)('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    await startServer()
  })
  afterAll(() => {
    killApp(context.server)
  })

  it('should compile pages for SSR', async () => {
    // The buffer of built page uses the on-demand-entries-ping to know which pages should be
    // buffered. Therefore, we need to double each render call with a ping.
    const pageContent = await renderViaHTTP(context.appPort, '/')
    expect(pageContent.includes('Index Page')).toBeTrue()
  })

  it('should compile pages for JSON page requests', async () => {
    await renderViaHTTP(context.appPort, '/about')
    const pageFile = getPageFileFromBuildManifest(appDir, '/about')
    const pageContent = await renderViaHTTP(
      context.appPort,
      join('/_next', pageFile)
    )
    expect(pageContent.includes('About Page')).toBeTrue()
  })

  it('should dispose inactive pages', async () => {
    await renderViaHTTP(context.appPort, '/')

    // Render two pages after the index, since the server keeps at least two pages
    await renderViaHTTP(context.appPort, '/about')

    await renderViaHTTP(context.appPort, '/third')

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
      browser = await webdriver(context.appPort, '/nav')

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
})
