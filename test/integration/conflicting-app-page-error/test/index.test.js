/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('conflict between app file and page file', () => {
  it('errors during build', async () => {
    const conflicts = ['/hello', '/another']
    const results = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
      env: { NEXT_SKIP_APP_REACT_INSTALL: '1' },
    })
    const output = results.stdout + results.stderr
    expect(output).toMatch(/Conflicting app and page files were found/)

    for (const conflict of conflicts) {
      expect(output).toContain(conflict)
    }
    expect(output).not.toContain('/non-conflict')
  })
})
