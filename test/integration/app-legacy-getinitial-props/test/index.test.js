/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

describe('Useless getInitialProps in _app', () => {
  it('should not opt-out of auto static optimization from not data dependent getInitialProps', async () => {
    const appDir = path.join(__dirname, '../fixtures/optimized')
    const output = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })
    const combinedOutput = output.stderr + output.stdout
    expect(output.code).toBe(0)
    expect(combinedOutput).not.toContain(
      'You have opted-out of Automatic Static Optimization due to'
    )
    expect(combinedOutput).toContain('_app')
  })

  it('should opt-out of auto static optimization from data dependent getInitialProps', async () => {
    const appDir = path.join(__dirname, '../fixtures/opted-out')
    const output = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })
    const combinedOutput = output.stderr + output.stdout

    expect(output.code).toBe(0)
    expect(combinedOutput).toContain(
      'You have opted-out of Automatic Static Optimization due to'
    )
    expect(combinedOutput).toContain('_app')
  })
})
