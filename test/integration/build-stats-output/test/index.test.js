/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = join(__dirname, '../react-site')

describe('Build Stats Output', () => {
  it('Shows correct package count in output', async () => {
    const { stdout } = await nextBuild(appDir, undefined, { stdout: true })
    expect(stdout).toMatch(/\/something .*?4/)
  })
})
