/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { runNextCommand } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 15
const appDir = join(__dirname, '../site')

describe('Handles Incorrect React Version', () => {
  it('should throw an error when building with next', async () => {
    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      cwd: appDir
    })
    expect(stderr).toMatch(/The module react with version 16\.4\.2 does not meet the minimum version specified.*[0-9]\.[0-9]\.[0-9] by Next\.js\. Please upgrade the dependency to at least.*[0-9]\.[0-9]\.[0-9]\./)
  })
})
