/* eslint-env jest */

import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

const appDir = join(__dirname, '..')
const configFile = new File(join(appDir, '/next.config.js'))
const configFileMjs = new File(join(appDir, '/next.config.mjs'))

describe('Config Experimental Warning', () => {
  afterEach(() => {
    configFile.write('')
    configFile.delete()
    configFileMjs.write('')
    configFileMjs.delete()
  })

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
    expect(stderr).not.toMatch('You have enabled experimental feature')
  })

  it('should not show warning with config from object', async () => {
    configFile.write(`
      module.exports = {
        target: 'server'
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).not.toMatch('You have enabled experimental feature')
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
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental feature (something) in next.config.js.'
    )
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
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental feature (something) in next.config.js.'
    )
  })

  it('should show warning with config from object with experimental and multiple keys', async () => {
    configFile.write(`
      module.exports = {
        experimental: {
          something: true,
          another: 1,
        }
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental features (something, another) in next.config.js.'
    )
  })

  it('should show warning with next.config.mjs from object with experimental', async () => {
    configFileMjs.write(`
      const config = {
        experimental: {
          something: true,
        }
      }
      export default config
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental feature (something) in next.config.mjs.'
    )
  })
})
