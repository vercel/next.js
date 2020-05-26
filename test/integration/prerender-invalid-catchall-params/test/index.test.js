/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')

describe('Invalid Prerender Catchall Params', () => {
  it('should fail the build', async () => {
    const out = await nextBuild(appDir, [], { stderr: true })
    expect(out.stderr).toMatch(`Build error occurred`)
    expect(out.stderr).toMatch(
      'A required parameter (slug) was not provided as an array in getStaticPaths for /[...slug]'
    )
  })
})
