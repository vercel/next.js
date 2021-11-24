/* eslint-env jest */

import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')

describe('Numeric Separator Support', () => {
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
