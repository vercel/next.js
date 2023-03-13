/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Legacy Prerender', () => {
  describe('handles old getStaticParams', () => {
    it('should fail the build in server mode', async () => {
      const out = await nextBuild(appDir, [], { stderr: true })
      expect(out.stderr).toMatch(`Build error occurred`)
      expect(out.stderr).toMatch(
        'unstable_getStaticParams was replaced with getStaticPaths. Please update your code.'
      )
    })
  })
})
