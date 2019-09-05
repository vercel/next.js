/* eslint-env jest */
/* global jasmine */
import path from 'path'

import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')

describe('Handles Duplicate Pages', () => {
  it('Throws an error during build', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toContain('Duplicate page detected')
  })
})
