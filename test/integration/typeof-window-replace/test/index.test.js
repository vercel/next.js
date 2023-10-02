/* eslint-env jest */

import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '../app')
let buildManifest
let pagesManifest

describe('typeof window replace', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
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
      expect(content).toMatch(/Hello.*?,.*?\n?.*?("|')object("|')/)
    })

    it('Replaces `typeof window` with undefined for server code', async () => {
      const pageFile = pagesManifest['/']

      const content = await fs.readFile(
        path.join(appDir, '.next', 'server', pageFile),
        'utf8'
      )

      expect(content).toMatch(/Hello.*?,.*?\n?.*?("|')undefined("|')/)
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
})
