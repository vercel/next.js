/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
describe('TypeScript Middleware', () => {
  describe('next build', () => {
    it('should not fail to build middleware', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).not.toMatch(/Failed to compile/)
      expect(stderr).not.toMatch(/is not assignable to type/)
      expect(code).toBe(0)
    })
  })
})
