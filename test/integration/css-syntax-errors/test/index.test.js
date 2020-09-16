/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const getFixtureDir = (fixture) =>
  join(__dirname, '../../css-fixtures', fixture)

describe('Custom _error', () => {
  it('should have proper syntax error for global CSS', async () => {
    const { stderr } = await nextBuild(
      getFixtureDir('global-syntax-error'),
      [],
      { stderr: true }
    )

    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('global.css')
    expect(stderr).toContain(`Error: Syntax error: Unexpected '/'`)
    expect(stderr).toContain(`// oops`)
  })

  it('should have proper syntax error for CSS modules', async () => {
    const { stderr } = await nextBuild(
      getFixtureDir('module-syntax-error'),
      [],
      { stderr: true }
    )

    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('hello.module.css')
    expect(stderr).toContain(`Error: Syntax error: Unexpected '/'`)
    expect(stderr).toContain(`// oops`)
  })
})
