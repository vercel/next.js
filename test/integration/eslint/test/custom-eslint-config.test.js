import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { remove } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../custom-eslint-config')

describe('ESLint', () => {
  let stdout
  let code

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    ;({ code, stdout } = await nextBuild(appDir, [], {
      stdout: true,
    }))
  })

  it('should show warnings and errors based on custom eslint config', async () => {
    expect(code).toBe(0)
    expect(stdout).not.toContain(
      'No ESLint configuration was detected, but checks from the Next.js ESLint plugin were included automatically'
    )
    expect(stdout).toContain('./pages/index.js')
    expect(stdout).not.toContain(
      "8:9  Warning: A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts"
    )
    expect(stdout).toContain(
      '9:9  Warning: In order to use external stylesheets use @import in the root stylesheet compiled with NextJS. This ensures proper priority to CSS when loading a webpage.  @next/next/no-css-tags'
    )
    expect(stdout).toContain(
      '9:9  Warning: Stylesheet does not have an associated preload tag. This could potentially impact First paint.  @next/next/missing-preload'
    )
    expect(stdout).toContain('Compiled successfully')
  })
})
