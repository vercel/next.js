/* eslint-env jest */

import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Promise in next config', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    afterEach(() =>
      fsp.rm(join(appDir, 'next.config.js', { recursive: true, force: true }))
    )

    it('should warn when a promise is returned on webpack', async () => {
      fsp.writeFile(
        join(appDir, 'next.config.js'),
        `
      module.exports = (phase, { isServer }) => {
        return {
          webpack: async (config) => {
            return config
          }
        }
      }
    `
      )

      const { stderr, stdout } = await nextBuild(appDir, undefined, {
        stderr: true,
        stdout: true,
      })
      expect(stderr + stdout).toMatch(
        /> Promise returned in next config\. https:\/\//
      )
    })
  })
})
