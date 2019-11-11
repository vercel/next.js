/* eslint-env jest */
/* global jasmine */
import path from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = path.join(__dirname, '..')

describe('Handles Errors During Export', () => {
  it('Does not crash workers', async () => {
    const { stdout, stderr } = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })

    expect(stdout + stderr).not.toMatch(/ERR_IPC_CHANNEL_CLOSED/)
  })
})
