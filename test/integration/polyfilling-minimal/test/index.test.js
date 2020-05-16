/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')

describe('Polyfilling (minimal)', () => {
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should compile successfully', async () => {
    const { code, stdout } = await nextBuild(appDir, [], {
      stdout: true,
    })
    expect(code).toBe(0)
    expect(stdout).toMatch(/Compiled successfully/)
  })
})
