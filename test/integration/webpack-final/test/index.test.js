/* eslint-env jest */

import path from 'path'

import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60)
const appDir = path.join(__dirname, '..')

describe('Applies webpack and webpackFinal configs', () => {
  describe('build', () => {
    let stdout

    beforeAll(async function () {
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      stdout = results.stdout
    })

    it('entry is object for webpackFinal', async () => {
      expect(stdout).toMatch(/webpack config - entry type: function/)
      expect(stdout).toMatch(/webpackFinal config - entry type: object/)
    })
  })
})
