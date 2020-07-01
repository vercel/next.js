/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

describe('Invalid next/document import outside _document', () => {
  const appDir = join(__dirname, '../')

  beforeAll(async () => {
    await fs.remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('next/document')
    expect(stderr).toMatch(
      /next\/document.*should.*not be imported outside.*_document/
    )
  })
})
