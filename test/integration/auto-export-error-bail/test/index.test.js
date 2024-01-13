/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

const runTests = () => {
  it('should not opt-out of auto static optimization from invalid _error', async () => {
    const output = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })

    if (output.code) {
      console.log(output)
    }

    const combinedOutput = output.stderr + output.stdout

    expect(output.code).toBe(0)
    expect(combinedOutput).not.toContain(
      'You have opted-out of Automatic Static Optimization due to'
    )
    expect(combinedOutput).toContain(
      'The following reserved Next.js pages were detected not directly under the pages directory'
    )
    expect(combinedOutput).toContain('/app/_error')
  })
}

describe('Auto Export _error bail', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    runTests()
  })
})
