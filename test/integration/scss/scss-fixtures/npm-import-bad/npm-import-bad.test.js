/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('CSS Import from node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = __dirname

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(code).toBe(0)
      expect(stderr).not.toMatch(/Can't resolve '[^']*?nprogress[^']*?'/)
      expect(stderr).not.toMatch(/Build error occurred/)
    })
  })
})
