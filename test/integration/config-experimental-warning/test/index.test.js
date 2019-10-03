/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30
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

    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).not.toMatch(/experimental feature/)
  })

  it('should not show warning with config from object', async () => {
    configFile.write(`
      module.exports = {
        target: 'server'
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).not.toMatch(/experimental feature/)
  })

  it('should show warning with config from object with experimental', async () => {
    configFile.write(`
      module.exports = {
        target: 'server',
        experimental: {
          publicDirectory: true
        }
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(/experimental feature/)
  })

  it('should show warning with config from function with experimental', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        target: 'server',
        experimental: {
          publicDirectory: true
        }
      })
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(/experimental feature/)
  })
})
