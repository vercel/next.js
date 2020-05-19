/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)
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
