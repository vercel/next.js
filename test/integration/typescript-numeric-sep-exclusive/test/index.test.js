/* eslint-env jest */
/* global jasmine */
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '../')

describe('TypeScript Exclusivity of Numeric Separator', () => {
  it('should fail to build for a JavaScript file', async () => {
    const { code, stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })

    expect(code).toBe(1)

    expect(stderr).toContain('Failed to compile.')
    expect(stderr).toContain('Syntax error')
    expect(stderr).toContain('config to enable transformation')
  })
})
