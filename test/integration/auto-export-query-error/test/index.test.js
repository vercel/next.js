/* eslint-env jest */

import path from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

const appDir = path.join(__dirname, '..')
const outdir = path.join(__dirname, 'out')
let stderr
let exitCode

const runTests = () => {
  it('should show warning for query provided for auto exported page correctly', async () => {
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'Error: you provided query values for / which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add `getInitialProps`'
    )

    expect(stderr).not.toContain('Error: you provided query values for /amp')
    expect(stderr).not.toContain('Error: you provided query values for /ssr')
    expect(stderr).not.toContain('Error: you provided query values for /ssg')
  })
}

describe('Auto Export', () => {
  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      const { stderr: curStderr, code: curCode } = await nextExport(
        appDir,
        { outdir },
        { stderr: true }
      )
      stderr = curStderr
      exitCode = curCode
    })

    runTests()
  })
})
