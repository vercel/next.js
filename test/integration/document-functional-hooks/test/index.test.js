/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Functional Custom Document Hook Errors', () => {
  describe('development mode', () => {
    it('throws when using a built-in hook', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).toMatch(
        /Functional Next.js Document components do not currently support React hooks/
      )
    })
  })
})
