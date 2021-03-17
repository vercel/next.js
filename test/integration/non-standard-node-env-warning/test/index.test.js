/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  waitFor,
  initNextServerScript,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const warningText = `You are using a non-standard "NODE_ENV" value in your environment`

let appPort
let app

const startServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'server.js')
  appPort = appPort = await findPort()
  const env = Object.assign({}, process.env, { PORT: `${appPort}` }, optEnv)

  return initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/,
    opts
  )
}

describe('Non-Standard NODE_ENV', () => {
  it('should not show the warning with no NODE_ENV set', async () => {
    let output = ''

    app = await launchApp(appDir, await findPort(), {
      onStderr(msg) {
        output += msg || ''
      },
    })
    await waitFor(2000)
    await killApp(app)
    expect(output).not.toContain(warningText)
  })

  it('should not show the warning with NODE_ENV set to valid value', async () => {
    let output = ''

    app = await launchApp(appDir, await findPort(), {
      env: {
        NODE_ENV: 'development',
      },
      onStderr(msg) {
        output += msg || ''
      },
    })
    await waitFor(2000)
    await killApp(app)
    expect(output).not.toContain(warningText)
  })

  it('should not show the warning with NODE_ENV set to valid value (custom server)', async () => {
    let output = ''

    app = await startServer(
      {
        NODE_ENV: 'development',
      },
      {
        onStderr(msg) {
          output += msg || ''
        },
      }
    )
    await waitFor(2000)
    await killApp(app)
    expect(output).not.toContain(warningText)
  })

  it('should show the warning with NODE_ENV set to invalid value', async () => {
    let output = ''

    app = await launchApp(appDir, await findPort(), {
      env: {
        NODE_ENV: 'abc',
      },
      onStderr(msg) {
        output += msg || ''
      },
    })
    await waitFor(2000)
    await killApp(app)
    expect(output).toContain(warningText)
  })

  it('should show the warning with NODE_ENV set to invalid value (custom server)', async () => {
    let output = ''

    app = await startServer(
      {
        NODE_ENV: 'abc',
      },
      {
        onStderr(msg) {
          output += msg || ''
        },
      }
    )
    await waitFor(2000)
    await killApp(app)
    expect(output).toContain(warningText)
  })
})
