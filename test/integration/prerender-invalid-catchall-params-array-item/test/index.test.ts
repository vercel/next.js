/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('Invalid Prerender Catchall Params Array Item', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should fail the build with a clear array item type error', async () => {
        const out = await nextBuild(appDir, [], { stderr: true })
        expect(out.stderr).toMatch('Build error occurred')
        expect(out.stderr).toMatch(
          'A required parameter (slug) was not provided as an array of strings received number in getStaticPaths for /[...slug]'
        )
      })
    }
  )
})
