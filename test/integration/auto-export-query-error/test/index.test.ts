/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')
let stderr
let exitCode

const runTests = () => {
  it('should show warning for query provided for auto exported page correctly', async () => {
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'Error: you provided query values for / which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add `getInitialProps`'
    )

    expect(stderr).not.toContain('Error: you provided query values for /ssr')
    expect(stderr).not.toContain('Error: you provided query values for /ssg')
  })
}

describe('Auto Export', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        const { stderr: curStderr, code: curCode } = await nextBuild(
          appDir,
          [],
          {
            stderr: true,
          }
        )
        stderr = curStderr
        exitCode = curCode
      })

      runTests()
    }
  )
})
