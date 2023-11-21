/* eslint-env jest */

import fsp from 'fs/promises'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')

const runTests = () => {
  it('should show error for GSSP during export', async () => {
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    expect(code).toBe(1)
    expect(stderr).toMatch(
      /pages with `getServerSideProps` can not be exported\. See more info here: https/
    )
  })
}

describe('getServerSideProps', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    afterAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      await fsp.rm(join(appDir, 'out'), { recursive: true, force: true })
    })

    runTests()
  })
})
