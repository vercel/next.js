/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { runNextCommand } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Invalid resolve alias', () => {
  it('should show relevant error when webpack resolve alias is wrong', async () => {
    const { stderr } = await runNextCommand(['build', join(__dirname, '..')], {
      stderr: true,
    })

    expect(stderr).toMatch(
      'webpack config.resolve.alias was incorrectly overriden. https://err.sh'
    )
  })
})
