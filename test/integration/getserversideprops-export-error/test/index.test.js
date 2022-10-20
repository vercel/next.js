/* eslint-env jest */

import fs from 'fs-extra'
import { nextBuild, nextExport } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

const runTests = () => {
  it('should build successfully', async () => {
    const { stdout, code } = await nextBuild(appDir, [], { stdout: true })
    expect(code).toBe(0)
    expect(stdout).toMatch(/Compiled successfully/)
  })

  it('should show error for GSSP during export', async () => {
    const { stderr, code } = await nextExport(
      appDir,
      { outdir: join(appDir, 'out') },
      { stderr: true }
    )

    expect(code).toBe(1)
    expect(stderr).toMatch(
      /pages with `getServerSideProps` can not be exported\. See more info here: https/
    )
  })
}

describe('getServerSideProps', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      await fs.remove(join(appDir, '.next'))
    })

    runTests()
  })
})
