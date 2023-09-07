/* eslint-env jest */
import path from 'path'
import { nextBuild, readNextBuildServerPageFile } from 'next-test-utils'

const appDir = path.join(__dirname, '../app')

describe('externalize next/dist/shared', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
  })

  it('Bundle next/dist/shared/lib/head.js but not next/dist/shared/lib/head-manager-context.js in _error', async () => {
    const content = readNextBuildServerPageFile(appDir, '/_error')
    expect(content).toContain(
      `require("next/dist/shared/lib/head-manager-context.js")`
    )
    expect(content).not.toContain(`require("next/dist/shared/lib/head.js")`)
  })
})
