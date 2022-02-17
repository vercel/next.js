/* eslint-env jest */

import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

const appDir = join(__dirname, '..')
const configFile = new File(join(appDir, '/next.config.js'))

describe('Promise in next config', () => {
  afterAll(() => configFile.delete())

  it('should not show warning with default config from function', async () => {
    configFile.write(`
      module.exports = (phase, { defaultConfig }) => {
        return {
          ...defaultConfig,
        }
      }
    `)

    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).not.toMatch(/experimental feature/)
  })

  it('should not show warning with config from object', async () => {
    configFile.write(`
      module.exports = {}
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).not.toMatch(/experimental feature/)
  })

  it('should show warning with config from object with experimental', async () => {
    configFile.write(`
      module.exports = {
        experimental: {
          something: true
        }
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(/experimental feature/)
  })

  it('should show warning with config from function with experimental', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        experimental: {
          something: true
        }
      })
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(/experimental feature/)
  })
})
