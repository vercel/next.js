/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { runNextCommand, findPort, File } from 'next-test-utils'

const configFile = new File(join(__dirname, '../next.config.js'))

fixture('Promise in next config').after(() => configFile.restore())

test('should throw error when a promise is return on config', async t => {
  configFile.write(`
    module.exports = (phase, { isServer }) => {
      return new Promise((resolve) => {
        resolve({ target: 'serverless' })
      })
    }
  `)

  const { stderr } = await runNextCommand(
    ['dev', join(__dirname, '..'), '-p', await findPort()],
    { stderr: true }
  )

  await t
    .expect(stderr)
    .match(
      /Error: > Promise returned in next config\. https:\/\/err\.sh\/zeit\/next\.js\/promise-in-next-config/
    )
})

test('should warn when a promise is returned on webpack', async t => {
  configFile.write(`
    setTimeout(() => process.extest(0), 2 * 1000)
    module.exports = (phase, { isServer }) => {
      return {
        webpack: async (config) => {
          return config
        }
      }
    }
  `)

  const { stderr } = await runNextCommand(
    ['dev', join(__dirname, '..'), '-p', await findPort()],
    { stderr: true }
  )

  await t
    .expect(stderr)
    .match(
      /> Promise returned in next config\. https:\/\/err\.sh\/zeit\/next\.js\/promise-in-next-config/
    )
})
