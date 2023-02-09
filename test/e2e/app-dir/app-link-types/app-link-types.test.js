/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'

const appDir = __dirname

describe('app link types', () => {
  it('should generate route types correctly and report link error', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })

    const dts = (
      await fs.readFile(path.join(appDir, '.next', 'types', 'link.d.ts'))
    ).toString()
    expect(dts.includes('`/dashboard/user/')).toBeTruthy()

    expect(stderr).toContain(
      'Type error: "/dashboard" is not an existing route. If it is intentional, please type it explicitly with `as Route`.'
    )
  })
})
