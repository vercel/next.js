/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  initNextServerScript,
  renderViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'

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
}

describe('Fetch polyfill with ky-universal', () => {
  describe('development mode', () => {
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
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
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
  })
})
