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
    expect(stderr).toContain('Export encountered errors on following paths')
    expect(stderr).toContain('/page')
    expect(stderr).toContain('/page-1')
    expect(stderr).toContain('/page-2')
    expect(stderr).toContain('/page-3')
    expect(stderr).toContain('/page-13')
  })
})
