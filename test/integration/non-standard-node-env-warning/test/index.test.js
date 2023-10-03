/* eslint-env jest */
import glob from 'glob'
import fs from 'fs-extra'
import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  waitFor,
  initNextServerScript,
  nextBuild,
  nextStart,
} from 'next-test-utils'

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
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should still DCE NODE_ENV specific code', async () => {
      await nextBuild(appDir, undefined, {
        env: {
          NODE_ENV: 'test',
        },
      })

      const staticFiles = glob.sync('**/*.js', {
        cwd: join(appDir, '.next/static'),
      })
      expect(staticFiles.length).toBeGreaterThan(0)

      for (const file of staticFiles) {
        const content = await fs.readFile(
          join(appDir, '.next/static', file),
          'utf8'
        )
        if (content.match(/cannot find module(?! for page)/i)) {
          throw new Error(`${file} contains module not found error`)
        }
      }
    })

    it('should show the warning with NODE_ENV set to development with next build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        env: {
          NODE_ENV: 'development',
        },
        stderr: true,
      })
      expect(stderr).toContain(warningText)
    })

    it('should show the warning with NODE_ENV set to development with next start', async () => {
      let output = ''

      await nextBuild(appDir)
      app = await nextStart(appDir, await findPort(), {
        env: {
          NODE_ENV: 'development',
        },
        onStderr(msg) {
          output += msg || ''
        },
      })
      await waitFor(2000)
      await killApp(app)
      expect(output).toContain(warningText)
    })
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

  it('should show the warning with NODE_ENV set to production with next dev', async () => {
    let output = ''

    app = await launchApp(appDir, await findPort(), {
      env: {
        NODE_ENV: 'production',
      },
      onStderr(msg) {
        output += msg || ''
      },
    })
    await waitFor(2000)
    await killApp(app)
    expect(output).toContain(warningText)
  })
})
