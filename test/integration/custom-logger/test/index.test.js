/* eslint-env jest */

import { join } from 'path'
import getPort from 'get-port'
import clone from 'clone'
import {
  initNextServerScript,
  killApp,
  renderViaHTTP,
  nextBuild,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

let appPort
let server
jest.setTimeout(1000 * 60 * 2)

const context = {}

const startServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = appPort = await getPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${appPort}` },
    optEnv
  )

  server = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/,
    opts
  )
}

describe('Custom Logger', () => {
  afterEach(() => killApp(server))

  it('should not use custom logger in dev mode', async () => {
    let stderr = ''
    await startServer(
      {},
      {
        onStderr(msg) {
          stderr += msg || ''
        },
      }
    )
    const html = await renderViaHTTP(appPort, '/index?error=true')
    expect(html).toContain('error from app')
    expect(stderr).not.toContain('custom logger')
    expect(stderr).toContain('error from app')
  })

  it('should use custom logger in production mode', async () => {
    const { code } = await nextBuild(appDir)
    expect(code).toBe(0)

    let stderr = ''

    await startServer(
      { NODE_ENV: 'production' },
      {
        onStderr(msg) {
          stderr += msg || ''
        },
      }
    )

    const html = await renderViaHTTP(appPort, '/index?error=true')
    expect(html).toContain('Internal Server Error')
    expect(stderr).toContain('custom logger: Error: error from app')
  })
})
