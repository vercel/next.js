/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

const warnMessage = /Using custom tsconfig configuration file/

describe('Custom TypeScript Config', () => {
  it('should warn when using custom typescript path', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })

    expect(stderr).toMatch(warnMessage)
  })
})
