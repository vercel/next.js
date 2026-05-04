/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Invalid Prerender Array Element Params', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should fail the build with array element type error', async () => {
        const out = await nextBuild(appDir, [], { stderr: true })
        expect(out.stderr).toMatch(`Build error occurred`)
        expect(out.stderr).toMatch(
          'Parameter "slug[1]" in getStaticPaths must be a string, got number (123) for /[...slug]'
        )
      })
    }
  )
})
