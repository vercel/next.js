/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('Invalid Global CSS with Custom App', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = __dirname

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.scss')
      expect(stderr).toMatch(
        /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
      )
      expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
    })
  })
})
