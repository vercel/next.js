/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Page Config', () => {
  it('builds without error when export const config is used outside page', async () => {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toMatch(/Failed to compile\./)
  })
})
