/* eslint-env jest */

import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')
describe('TypeScript filtered files', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should fail to build the app with a file named con*test*.js', async () => {
        const output = await nextBuild(appDir, [], {
          stdout: true,
          stderr: true,
        })
        expect(output.stdout).not.toMatch(/Compiled successfully/)
        expect(output.code).toBe(1)
        expect(output.stderr).toMatch(/Failed to compile/)
        expect(output.stderr).toMatch(/is not assignable to type 'boolean'/)
      })
    }
  )
})
