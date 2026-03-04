/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Invalid Prerender Catchall Params', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should fail the build', async () => {
        const out = await nextBuild(appDir, [], { stderr: true })
        expect(out.stderr).toMatch(`Build error occurred`)
        expect(out.stderr).toContain(
          'A required parameter (slug) was not provided as an array of strings in getStaticPaths for /[...slug].'
        )
        expect(out.stderr).toContain('Received: string ("hello")')
      })
    }
  )
})
