/* eslint-env jest */
import WebSocket from 'ws'
import { join } from 'path'
import webdriver from 'next-webdriver'
import getPort from 'get-port'
import {
  renderViaHTTP,
  fetchViaHTTP,
  killApp,
  waitFor,
  check,
  getBrowserBodyText,
  getPageFileFromBuildManifest,
  getBuildManifest,
  initNextServerScript,
} from 'next-test-utils'
import { assetPrefix } from '../next.config'

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

const doPing = (page) => {
  return new Promise((resolve) => {
    context.ws.onmessage = (e) => {
      console.log(e)

      resolve()
    }
    context.ws.send(JSON.stringify({ event: 'ping', page }))
  })
}

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    await startServer()

    // Send an initial request to nextjs to establish an 'upgrade' listener
    // If we send the websocket request as the first thing, it will result in 404 due to listener not set yet
    // This is by design as the 'upgrade' listener is set during the first request run
    await fetchViaHTTP(context.appPort, '/')

    await new Promise((resolve, reject) => {
      context.ws = new WebSocket(
        `ws://localhost:${context.appPort}${
          assetPrefix ? `/${assetPrefix}` : ''
        }/_next/webpack-hmr`
      )
      context.ws.on('open', () => resolve())
      context.ws.on('error', (err) => {
        console.error(err)

        context.ws.close()
        reject()
      })
    })
  })
  afterAll(() => {
    context.ws.close()
    killApp(context.server)
  })

  it('should compile pages for SSR', async () => {
    // The buffer of built page uses the on-demand-entries-ping to know which pages should be
    // buffered. Therefore, we need to double each render call with a ping.
    const pageContent = await renderViaHTTP(context.appPort, '/')
    await doPing('/')
    expect(pageContent.includes('Index Page')).toBeTruthy()
  })

  it('should compile pages for JSON page requests', async () => {
    await renderViaHTTP(context.appPort, '/about')
    const pageFile = getPageFileFromBuildManifest(appDir, '/about')
    const pageContent = await renderViaHTTP(
      context.appPort,
      join('/_next', pageFile)
    )
    expect(pageContent.includes('About Page')).toBeTruthy()
  })

  it('should dispose inactive pages', async () => {
    await renderViaHTTP(context.appPort, '/')
    await doPing('/')

    // Render two pages after the index, since the server keeps at least two pages
    await renderViaHTTP(context.appPort, '/about')
    await doPing('/about')

    await renderViaHTTP(context.appPort, '/third')
    await doPing('/third')

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
