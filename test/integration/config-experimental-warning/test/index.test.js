/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

const appDir = join(__dirname, '..')
const configFile = new File(join(appDir, '/next.config.js'))

fixture('Promise in next config').after(() => configFile.delete())

test('should not show warning with default config from function', async t => {
  configFile.write(`
    module.exports = (phase, { defaultConfig }) => {
      return {
        target: 'server',
        ...defaultConfig,
      }
    }
  `)

  const { stderr } = await nextBuild(appDir, [], { stderr: true })
  await t.expect(stderr).notMatch(/experimental feature/)
})

test('should not show warning with config from object', async t => {
  configFile.write(`
    module.exports = {
      target: 'server'
    }
  `)
  const { stderr } = await nextBuild(appDir, [], { stderr: true })
  await t.expect(stderr).notMatch(/experimental feature/)
})

test('should show warning with config from object with experimental', async t => {
  configFile.write(`
    module.exports = {
      target: 'server',
      experimental: {
        something: true
      }
    }
  `)
  const { stderr } = await nextBuild(appDir, [], { stderr: true })
  await t.expect(stderr).match(/experimental feature/)
})

test('should show warning with config from function with experimental', async t => {
  configFile.write(`
    module.exports = (phase) => ({
      target: 'server',
      experimental: {
        something: true
      }
    })
  `)
  const { stderr } = await nextBuild(appDir, [], { stderr: true })
  await t.expect(stderr).match(/experimental feature/)
})
