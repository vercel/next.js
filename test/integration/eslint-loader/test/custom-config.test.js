import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import { writeFile } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../custom-config')
let appPort
let app

jest.setTimeout(1000 * 60 * 5)

describe('ESLint', () => {
  afterEach(() => killApp(app))
  it('should throw build errors as seen by eslint', async () => {
    const { code, stdout, stderr } = await nextBuild(appDir, [], {
      ignoreFail: true,
      stderr: true,
      stdout: true,
    })
    expect(code).toBe(1)
    expect(stderr).toContain('ReferenceError: f is not defined')
    expect(stdout).toContain(
      'info  - Creating an optimized production build...'
    )
    expect(stdout).toContain(
      'test/integration/eslint-loader/custom-config/pages/_document.jsx'
    )
    expect(stdout).toContain(
      `15:11  warning  A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts`
    )
    expect(stdout).toContain(
      'test/integration/eslint-loader/custom-config/pages/index.js'
    )
    expect(stdout).toContain(`2:21  warning  'f' is not defined  no-undef`)
  })
})
