/* eslint-env jest */
/* global jasmine, test */
import path from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = path.join(__dirname, '..')

describe('Invalid Page autoExport', () => {
  it('Fails softly with descriptive error', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })

    expect(stderr).toMatch(
      /autoExport failed: found pages without React Component as default export/
    )
    expect(stderr).toMatch(/pages\/invalid/)
    expect(stderr).toMatch(/pages\/also-invalid/)
  })
})
