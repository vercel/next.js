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
          newNextLinkBehavior: true
        }
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental feature (newNextLinkBehavior) in next.config.js.'
    )
  })

  it('should show warning with config from function with experimental', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        target: 'server',
        experimental: {
          newNextLinkBehavior: true
        }
      })
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental feature (newNextLinkBehavior) in next.config.js.'
    )
  })

  it('should not show warning with default value', async () => {
    configFile.write(`
      module.exports = (phase) => ({
        target: 'server',
        experimental: {
          newNextLinkBehavior: false
        }
      })
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).not.toMatch(
      'You have enabled experimental feature (newNextLinkBehavior) in next.config.js.'
    )
  })

  it('should show warning with config from object with experimental and multiple keys', async () => {
    configFile.write(`
      module.exports = {
        experimental: {
          newNextLinkBehavior: true,
          legacyBrowsers: false,
        }
      }
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental features (newNextLinkBehavior, legacyBrowsers) in next.config.js.'
    )
  })

  it('should show warning with next.config.mjs from object with experimental', async () => {
    configFileMjs.write(`
      const config = {
        experimental: {
          newNextLinkBehavior: true,
        }
      }
      export default config
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have enabled experimental feature (newNextLinkBehavior) in next.config.mjs.'
    )
  })

  it('should show warning with next.config.js from object with non-exist experimental', async () => {
    configFile.write(`
      const config = {
        experimental: {
          foo: true
        }
      }
      module.exports = config
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have defined experimental feature (foo) in next.config.js that does not exist in this version'
    )
  })

  it('should show warning with next.config.mjs from object with non-exist experimental', async () => {
    configFileMjs.write(`
      const config = {
        experimental: {
          foo: true
        }
      }
      export default config
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have defined experimental feature (foo) in next.config.mjs that does not exist in this version'
    )
  })

  it('should show warning with next.config.js from object with multiple non-exist experimental', async () => {
    configFile.write(`
      const config = {
        experimental: {
          foo: true,
          bar: false
        }
      }
      module.exports = config
    `)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toMatch(
      'You have defined experimental features (foo, bar) in next.config.js that do not exist in this version'
    )
  })
})
