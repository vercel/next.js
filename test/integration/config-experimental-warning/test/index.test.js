/* eslint-env jest */

import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

jest.setTimeout(1000 * 30)
const appDir = join(__dirname, '..')
const configFile = new File(join(appDir, '/next.config.js'))

describe('Promise in next config', () => {
  afterAll(() => configFile.delete())

  it('should not show warning with default config from function', async () => {
    configFile.write(`
      module.exports = (phase, { defaultConfig }) => {
        return {
          target: 'server',
          ...defaultConfig,
        }
      }
    `)

    const { stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(stdout).not.toMatch(/experimental feature/)
  })

  it('should not show warning with config from object', async () => {
    configFile.write(`
      module.exports = {
        target: 'server'
      }
    `)
    const { stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(stdout).not.toMatch(/experimental feature/)
  })

  it('should show warning with config from object with experimental', async () => {
    configFile.write(`
      module.exports = {
        target: 'server',
        experimental: {
          something: true
        }
      }
    `)
    const { stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(stdout).toMatch(/experimental feature/)
  })

  it('should show warning with config from function with experimental', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        target: 'server',
        experimental: {
          something: true
        }
      })
    `)
    const { stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(stdout).toMatch(/experimental feature/)
  })
})
