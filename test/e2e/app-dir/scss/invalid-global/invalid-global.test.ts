/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'
// In order for the global isNextStart to be set
import 'e2e-utils'

describe('Invalid Global CSS', () => {
  ;(Boolean((global as any).isNextStart) ? describe : describe.skip)(
    'production only',
    () => {
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
    }
  )
})
