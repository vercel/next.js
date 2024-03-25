/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  initNextServerScript,
  fetchViaHTTP,
  renderViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import cheerio from 'cheerio'

const appDir = join(__dirname, '../')
let appPort
let app
let apiServerPort
let apiServer

const startApiServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'api-server.js')
  apiServerPort = await findPort()
  const env = Object.assign(
    { ...process.env },
    { PORT: `${apiServerPort}` },
    optEnv
  )

  apiServer = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/,
    opts
  )
}

function runTests() {
  it('includes polyfilled fetch when using getStaticProps', async () => {
    const html = await renderViaHTTP(appPort, '/static')
    expect(html).toMatch(/bar/)
  })
  it('includes polyfilled fetch when using getServerSideProps', async () => {
    const html = await renderViaHTTP(appPort, '/ssr')
    expect(html).toMatch(/bar/)
  })
  it('includes polyfilled fetch when using getInitialProps', async () => {
    const html = await renderViaHTTP(appPort, '/getinitialprops')
    expect(html).toMatch(/bar/)
  })

  it('includes polyfilled fetch when using API routes', async () => {
    const res = await fetchViaHTTP(appPort, '/api/api-route')
    const json = await res.json()

    expect(json.foo).toBe('bar')
  })

  it('includes polyfilled fetch when using getStaticPaths', async () => {
    const htmlA = await renderViaHTTP(appPort, '/user/a')
    const $a = cheerio.load(htmlA)
    expect($a('#username').text()).toBe('a')

    const htmlB = await renderViaHTTP(appPort, '/user/b')
    const $b = cheerio.load(htmlB)
    expect($b('#username').text()).toBe('b')
  })
}

describe('Fetch polyfill', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        await startApiServer()
        app = await launchApp(appDir, appPort, {
          env: {
            NEXT_PUBLIC_API_PORT: apiServerPort,
          },
        })
      })
      afterAll(async () => {
        await killApp(app)
        await killApp(apiServer)
      })

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await startApiServer()
        await nextBuild(appDir, [], {
          env: {
            NEXT_PUBLIC_API_PORT: apiServerPort,
          },
        })
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
        await killApp(apiServer)
      })

      runTests()
    }
  )
})
