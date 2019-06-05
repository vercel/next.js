/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { runNextCommand, findPort, File } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30
const configFile = new File(join(__dirname, '../next.config.js'))

describe('Promise in next config', () => {
  afterAll(() => configFile.restore())

  it('should throw error when a promise is return on config', async () => {
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

    expect(stderr).toMatch(
      /Error: > Promise returned in next config\. https:\/\/err\.sh\/zeit\/next\.js\/promise-in-next-config\.md/
    )
  })

  it('should warn when a promise is returned on webpack', async () => {
    configFile.write(`
      setTimeout(() => process.exit(0), 2 * 1000)
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

    expect(stderr).toMatch(
      /> Promise returned in next config\. https:\/\/err\.sh\/zeit\/next\.js\/promise-in-next-config\.md/
    )
  })
})
