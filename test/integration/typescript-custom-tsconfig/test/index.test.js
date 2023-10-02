/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

const warnMessage = /Using tsconfig file:/

describe('Custom TypeScript Config', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should warn when using custom typescript path', async () => {
      const { stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })

      expect(stdout).toMatch(warnMessage)
    })
  })
})
