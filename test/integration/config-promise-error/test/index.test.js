/* eslint-env jest */

import { File, findPort, runNextCommand } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 30)
const configFile = new File(join(__dirname, '../next.config.js'))

describe('Promise in next config', () => {
  afterAll(() => configFile.restore())

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
      /> Promise returned in next config\. https:\/\/err\.sh\/vercel\/next\.js\/promise-in-next-config/
    )
  })
})
