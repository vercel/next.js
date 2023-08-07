/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const appDir = join(__dirname, '../')

describe('next.config.js schema validating', () => {
  it('should validate against defaultConfig', async () => {
    const result = await nextBuild(appDir, undefined, {
      stderr: true,
      stdout: true,
    })
    const output = stripAnsi(result.stderr + result.stdout)

    expect(output).not.toContain('Invalid next.config.js options detected')
    expect(result.code).toBe(0)
  })
})
