import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { remove } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../pkg-json-eslint-config')

describe('ESLint', () => {
  let code
  let output

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    let stderr
    let stdout
    ;({ code, stdout, stderr } = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    }))
    output = stderr + stdout
  })

  it('should show warnings and errors based on eslint config in package.json', async () => {
    expect(code).toBe(0)
    expect(output).not.toContain(
      'The Next.js ESLint plugin was not detected in'
    )
    expect(output).not.toContain(
      'No ESLint configuration was detected, but checks from the Next.js ESLint plugin were included automatically'
    )
    expect(output).toContain('./pages/index.js')
    expect(output).not.toContain(
      "8:9  Warning: A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts"
    )
    expect(output).toContain(
      '9:9  Warning: In order to use external stylesheets use @import in the root stylesheet compiled with NextJS. This ensures proper priority to CSS when loading a webpage.  @next/next/no-css-tags'
    )
    expect(output).toContain(
      '9:9  Warning: Stylesheet does not have an associated preload tag. This could potentially impact First paint.  @next/next/missing-preload'
    )
    expect(output).toContain('Compiled successfully')
  })
})
