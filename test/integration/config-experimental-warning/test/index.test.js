/* eslint-env jest */

import { join } from 'path'
import { killApp, launchApp, findPort, File } from 'next-test-utils'

const appDir = join(__dirname, '..')
const configFile = new File(join(appDir, '/next.config.js'))
const configFileMjs = new File(join(appDir, '/next.config.mjs'))

let app
async function collectStdout(appDir) {
  let stdout = ''
  const port = await findPort()
  app = await launchApp(appDir, port, {
    onStdout(msg) {
      stdout += msg
    },
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

    const stdout = await collectStdout(appDir)
    expect(stdout).not.toMatch(' - Experiments (use at your own risk):')
  })

  it('should not show warning with config from object', async () => {
    configFile.write(`
      module.exports = {
        images: {},
      }
    `)

    const stdout = await collectStdout(appDir)
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

    const stdout = await collectStdout(appDir)
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

    const stdout = await collectStdout(appDir)
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

    const stdout = await collectStdout(appDir)
    expect(stdout).not.toMatch(' - Experiments (use at your own risk):')
    expect(stdout).not.toMatch(' · workerThreads')
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

    const stdout = await collectStdout(appDir)
    expect(stdout).toMatch(' - Experiments (use at your own risk):')
    expect(stdout).toMatch(' · workerThreads')
    expect(stdout).toMatch(' · scrollRestoration')
  })
})
