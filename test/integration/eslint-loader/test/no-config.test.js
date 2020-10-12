import { join } from 'path'
import { killApp, nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../no-config')
let app

jest.setTimeout(1000 * 60 * 5)

describe('ESLint', () => {
  it('should throw build errors as seen by eslint', async () => {
    const { code, stdout, stderr } = await nextBuild(appDir, [], {
      ignoreFail: true,
      stderr: true,
      stdout: true,
    })
    expect(code).toBe(1)
    expect(stdout).toContain(`error  'f' is not defined  no-undef`)
    expect(stdout).toContain(
      'info  - Creating an optimized production build...'
    )
    expect(stdout).toContain(
      'test/integration/eslint-loader/no-config/pages/_document.jsx'
    )
    expect(stdout).toContain(
      `14:11  warning  A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts`
    )
    expect(stdout).toContain(
      'test/integration/eslint-loader/no-config/pages/index.js'
    )
    expect(stdout).toContain(`2:21  error  'f' is not defined  no-undef`)
  })
})
