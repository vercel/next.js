/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Empty configuration', () => {
  it('should show relevant warning when configuration is not found', async () => {
    const { stdout } = await nextBuild(join(__dirname, '..'), [], {
      stdout: true,
    })
    expect(stdout).not.toMatch(
      /Warning: Detected next.config.js, no exported configuration found./
    )
  })
})
