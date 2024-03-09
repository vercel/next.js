/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'
// In order for the global isNextStart to be set
import 'e2e-utils'

console.log({ global })

describe('CSS Import from node_modules', () => {
  ;(Boolean((global as any).isNextStart) ? describe : describe.skip)(
    'production only',
    () => {
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
    }
  )
})
