/* eslint-env jest */

import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = path.join(__dirname, '../app')
let buildManifest
let pagesManifest

describe('typeof window replace', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    buildManifest = require(path.join(
      appDir,
      '.next/build-manifest.json'
    ), 'utf8')
    pagesManifest = require(path.join(
      appDir,
      '.next/server/pages-manifest.json'
    ), 'utf8')
  })

  it('Replaces `typeof window` with object for client code', async () => {
    const pageFile = buildManifest.pages['/'].find(
      (file) => file.endsWith('.js') && file.includes('pages/index')
    )

    const content = await fs.readFile(
      path.join(appDir, '.next', pageFile),
      'utf8'
    )
    expect(content).toMatch(/Hello.*?,.*?("|')object("|')/)
  })

  it('Replaces `typeof window` with undefined for server code', async () => {
    const pageFile = pagesManifest['/']

    const content = await fs.readFile(
      path.join(appDir, '.next', 'server', pageFile),
      'utf8'
    )

    expect(content).toMatch(/Hello.*?,.*?("|')undefined("|')/)
  })

  it('Does not replace `typeof window` for `node_modules` code', async () => {
    const pageFile = buildManifest.pages['/'].find(
      (file) => file.endsWith('.js') && file.includes('pages/index')
    )

    const content = await fs.readFile(
      path.join(appDir, '.next', pageFile),
      'utf8'
    )
    expect(content).toMatch(/MyComp:.*?,.*?typeof window/)
  })
})
