/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Empty configuration', () => {
  it('should show relevant warning and compile successfully', async () => {
    const { stderr, stdout } = await nextBuild(join(__dirname, '..'), [], {
      stderr: true,
      stdout: true,
    })

    expect(stderr).toMatch(
      /Warning: Detected next.config.js, no exported configuration found./
    )
    expect(stdout).toMatch(/Compiled successfully./)
  })
})
