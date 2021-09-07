/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60)

const appDir = join(__dirname, '../app')

describe('build trace with extra entries', () => {
  it('should build and trace correctly', async () => {
    const result = await nextBuild(appDir, undefined, {
      cwd: appDir,
    })
    expect(result.code).toBe(0)

    const appTrace = await fs.readJSON(
      join(appDir, '.next/server/pages/_app.js.nft.json')
    )
    const indexTrace = await fs.readJSON(
      join(appDir, '.next/server/pages/index.js.nft.json')
    )

    expect(appTrace.files.some((file) => file.endsWith('hello.json'))).toBe(
      true
    )
    expect(
      indexTrace.files.some((file) => file.endsWith('hello.json'))
    ).toBeFalsy()
    expect(
      indexTrace.files.some((file) => file.includes('some-cms/index.js'))
    ).toBe(true)
  })
})
