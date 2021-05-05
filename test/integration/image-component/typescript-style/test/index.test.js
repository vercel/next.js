/* eslint-env jest */

import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

describe('TypeScript Image Component with Styles', () => {
  describe('next build', () => {
    it('should fail to build when the `style` prop is passed to <Image />', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).toMatch(/Failed to compile/)
      expect(stderr).toMatch(/Property 'style' does not exist on type/)
      expect(code).toBe(1)
    })
  })
})
