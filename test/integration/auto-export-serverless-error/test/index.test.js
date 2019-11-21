/* eslint-env jest */
/* global jasmine */
import fs from 'fs'
import path from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
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
