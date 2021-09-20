/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Promise in next config', () => {
  afterAll(() => fs.remove(join(appDir, 'next.config.js')))

  it('should throw error when a promise is return on config', async () => {
    fs.writeFile(
      join(appDir, 'next.config.js'),
      `
      module.exports = (phase, { isServer }) => {
        return new Promise((resolve) => {
          resolve({ target: 'serverless' })
        })
      }
    `
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

    expect(stderr).toMatch(
      /Error: > Promise returned in next config\. https:\/\//
    )
  })

  it('should warn when a promise is returned on webpack', async () => {
    fs.writeFile(
      join(appDir, 'next.config.js'),
      `
      setTimeout(() => process.exit(0), 2 * 1000)
      module.exports = (phase, { isServer }) => {
        return {
          webpack: async (config) => {
            return config
          }
        }
      }
    `
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).toMatch(/> Promise returned in next config\. https:\/\//)
  })
})
