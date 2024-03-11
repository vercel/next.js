/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

// This test is skipped because it's not relevant to Turbopack.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Reports stack trace when webpack plugin stack overflows',
  () => {
    it('shows details in next build', async () => {
      const { code, stderr } = await nextBuild(appDir, undefined, {
        stderr: true,
        ignoreFail: true,
      })
      expect(code).toBe(1)
      expect(stderr).toContain(
        'caused by plugins in Compilation.hooks.processAssets'
      )
      expect(stderr).toContain('Maximum call stack size exceeded')
      expect(stderr).toContain('next.config.js:7')
    })
  }
)
