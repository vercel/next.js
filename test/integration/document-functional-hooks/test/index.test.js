/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Functional Custom Document Hook Errors', () => {
  describe('development mode', () => {
    it('warns when using a <title> in document/head', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).toMatch(
        /Functional Document components do not currently support React hooks/
      )
    })
  })
})
