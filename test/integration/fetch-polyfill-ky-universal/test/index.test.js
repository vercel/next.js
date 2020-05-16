/* eslint-env jest */

import fs from 'fs-extra'
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
import clone from 'clone'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app
let apiServerPort
let apiServer

const startApiServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'api-server.js')
  apiServerPort = await findPort()
  const env = Object.assign(
    {},
    clone(process.env),
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

const startServerlessServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'serverless-server.js')
  appPort = await findPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${appPort}` },
    optEnv
  )

  return await initNextServerScript(
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
  describe('dev support', () => {
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

  describe('Server support', () => {
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

  describe('Serverless support', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )
      await startApiServer()
      await nextBuild(appDir, [], {
        env: {
          NEXT_PUBLIC_API_PORT: apiServerPort,
        },
      })
      appPort = await findPort()
      app = await startServerlessServer()
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfig)
      await killApp(apiServer)
    })

    runTests()
  })
})
