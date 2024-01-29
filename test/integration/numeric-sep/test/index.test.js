/* eslint-env jest */

import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '../')

describe('Numeric Separator Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should successfully build for a JavaScript file', async () => {
      const { code, stdout, stderr } = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })

      expect(code).toBe(0)

      expect(stdout).toContain('Compiled successfully')
      expect(stderr).not.toContain('Failed to compile')
    })
  })
})
