/* eslint-env jest */

import fs from 'fs-extra'
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
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await fs.remove(join(appDir, 'out'))
      })

      runTests()
    }
  )
})
