/* eslint-env jest */

import fs from 'fs'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('Auto Export Error Serverless', () => {
  it('fails to emit the page', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })

    expect(
      fs.existsSync(path.join(appDir, '.next/serverless/pages/index.html'))
    ).toBe(false)
    expect(stderr).toContain('ReferenceError')
    expect(stderr).toContain('Build error occurred')
  })
})
