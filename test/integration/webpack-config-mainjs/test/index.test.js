/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '../')

describe('Customized webpack config with main.js', () => {
  it('should run correctly with main.js customized', async () => {
    const { code } = await nextBuild(appDir, [], {})

    expect(code).toBe(0)
  })
})
