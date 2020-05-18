/* eslint-env jest */

import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export error for fallback: true', () => {
  it('should build successfully', async () => {
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should have error during next export', async () => {
    const { stderr } = await nextExport(appDir, { outdir }, { stderr: true })
    expect(stderr).toContain('Found pages with `fallback: true`')
    expect(stderr).toContain(
      'Pages with `fallback: true` in `getStaticPaths` can not be exported'
    )
    expect(stderr).toContain('/[slug]')
  })
})
