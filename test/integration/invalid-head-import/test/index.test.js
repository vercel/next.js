/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

describe('Invalid next/head import in _document', () => {
  const appDir = join(__dirname, '../')

  beforeAll(async () => {
    await fs.remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('next/head')
    expect(stderr).toMatch(
      /next\/head.*should.*not be imported inside.*_document/
    )
  })
})
