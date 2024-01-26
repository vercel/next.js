/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  launchApp,
  findPort,
  File,
  nextBuild,
  nextStart,
  check,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const appDir = join(__dirname, '..')
const configFile = new File(join(appDir, '/next.config.js'))
const configFileMjs = new File(join(appDir, '/next.config.mjs'))

let app
async function collectStdoutFromDev(appDir) {
  let stdout = ''
  const port = await findPort()
  app = await launchApp(appDir, port, {
    onStdout(msg) {
      stdout += msg
    },
  })
  return stdout
}

async function collectStdoutFromBuild(appDir) {
  const { stdout } = await nextBuild(appDir, [], {
    stdout: true,
  })
  return stdout
}

describe('Config Experimental Warning', () => {
  afterEach(() => {
    configFile.write('')
    configFile.delete()
    configFileMjs.write('')
    configFileMjs.delete()
    if (app) {
      killApp(app)
      app = undefined
    }
  })

  it('should not show warning with default config from function', async () => {
    configFile.write(`
      module.exports = (phase, { defaultConfig }) => {
        return {
          ...defaultConfig,
        }
      }
    `)

    const stdout = await collectStdoutFromDev(appDir)
    expect(stdout).not.toMatch(' - Experiments (use at your own risk):')
  })

  it('should not show warning with config from object', async () => {
    configFile.write(`
      module.exports = {
        images: {},
      }
    `)

    const stdout = await collectStdoutFromDev(appDir)
    expect(stdout).not.toMatch(' - Experiments (use at your own risk):')
  })

  it('should show warning with config from object with experimental', async () => {
    configFile.write(`
      module.exports = {
        experimental: {
          workerThreads: true
        }
      }
    `)

    const stdout = await collectStdoutFromDev(appDir)
    expect(stdout).toMatch(' - Experiments (use at your own risk):')
    expect(stdout).toMatch(' · workerThreads')
  })

  it('should show warning with config from function with experimental', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        experimental: {
          workerThreads: true
        }
      })
    `)

    const stdout = await collectStdoutFromDev(appDir)
    expect(stdout).toMatch(' - Experiments (use at your own risk):')
    expect(stdout).toMatch(' · workerThreads')
  })

  it('should not show warning with default value', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        experimental: {
          workerThreads: false
        }
      })
    `)

    const stdout = await collectStdoutFromDev(appDir)
    expect(stdout).not.toContain(' - Experiments (use at your own risk):')
    expect(stdout).not.toContain(' · workerThreads')
  })

  it('should show warning with config from object with experimental and multiple keys', async () => {
    configFile.write(`
      module.exports = {
        experimental: {
          workerThreads: true,
          scrollRestoration: true,
        }
      }
    `)

    const stdout = await collectStdoutFromDev(appDir)
    expect(stdout).toContain(' - Experiments (use at your own risk):')
    expect(stdout).toContain(' · workerThreads')
    expect(stdout).toContain(' · scrollRestoration')
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should not show next app info in next start', async () => {
      configFile.write(`
        module.exports = {
          experimental: {
            workerThreads: true,
            scrollRestoration: true,
            instrumentationHook: true,
            cpus: 2,
          }
        }
      `)

      await collectStdoutFromBuild(appDir)
      const port = await findPort()
      let stdout = ''
      app = await nextStart(appDir, port, {
        onStdout(msg) {
          stdout += msg
        },
      })
      expect(stdout).not.toMatch(' - Experiments (use at your own risk):')
    })

    it('should show next app info with all experimental features in next build', async () => {
      configFile.write(`
        module.exports = {
          experimental: {
            workerThreads: true,
            scrollRestoration: true,
            instrumentationHook: true,
            cpus: 2,
          }
        }
      `)
      const stdout = await collectStdoutFromBuild(appDir)
      expect(stdout).toMatch(' - Experiments (use at your own risk):')
      expect(stdout).toMatch(' · cpus')
      expect(stdout).toMatch(' · workerThreads')
      expect(stdout).toMatch(' · scrollRestoration')
      expect(stdout).toMatch(' · instrumentationHook')
    })

    it('should show unrecognized experimental features in warning but not in start log experiments section', async () => {
      configFile.write(`
        module.exports = {
          experimental: {
            appDir: true
          }
        }
      `)

      await collectStdoutFromBuild(appDir)
      const port = await findPort()
      let stdout = ''
      let stderr = ''
      app = await nextStart(appDir, port, {
        onStdout(msg) {
          stdout += msg
        },
        onStderr(msg) {
          stderr += msg
        },
      })

      await check(() => {
        const cliOutput = stripAnsi(stdout)
        const cliOutputErr = stripAnsi(stderr)
        expect(cliOutput).not.toContain(
          ' - Experiments (use at your own risk):'
        )
        expect(cliOutputErr).toContain(
          `Unrecognized key(s) in object: 'appDir' at "experimental"`
        )
      })
    })
  })
})
