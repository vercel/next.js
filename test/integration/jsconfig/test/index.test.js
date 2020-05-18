/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

describe('jsconfig.json', () => {
  it('should build normally', async () => {
    const res = await await nextBuild(appDir, [], { stdout: true })
    expect(res.stdout).toMatch(/Compiled successfully\./)
  })

  it('should fail on invalid jsconfig.json', async () => {
    const originalJsconfig = await fs.readFile(join(appDir, 'jsconfig.json'), {
      encoding: 'utf-8',
    })
    await fs.writeFile(join(appDir, 'jsconfig.json'), '{', {
      encoding: 'utf-8',
    })
    try {
      const res = await nextBuild(appDir, [], { stderr: true })
      expect(res.stderr).toMatch(/Error: Failed to parse "/)
      expect(res.stderr).toMatch(/JSON5: invalid end of input at 1:2/)
    } finally {
      await fs.writeFile(join(appDir, 'jsconfig.json'), originalJsconfig, {
        encoding: 'utf-8',
      })
    }
  })
})
