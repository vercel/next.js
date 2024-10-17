/* eslint-env jest */

import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '../app')
let buildManifest

describe('typeof window replace', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        buildManifest = require(path.join(
          appDir,
          '.next/build-manifest.json'
        ), 'utf8')
      })

      it('Replaces `typeof window` with object for client code', async () => {
        let allContent = ''
        const files = buildManifest.pages['/'].filter((item) =>
          item.endsWith('.js')
        )
        for (const file of files) {
          const content = await fs.readFile(
            path.join(appDir, '.next', file),
            'utf8'
          )
          allContent += content
        }
        expect(allContent).toMatch(/Hello.*?,.*?\n?.*?("|')object("|')/)
      })

      it('Replaces `typeof window` with undefined for server code', async () => {
        let allContent = ''
        const chunksFilesDir = path.join(appDir, '.next', 'server', 'chunks')
        const allFilesInDotNextServerChunks = await fs
          .readdirSync(chunksFilesDir, {
            recursive: true,
          })
          .filter((item) => item.endsWith('.js'))
        for (const file of allFilesInDotNextServerChunks) {
          const content = await fs.readFile(
            path.join(chunksFilesDir, file),
            'utf8'
          )
          allContent += content
        }

        const pagesFilesDir = path.join(appDir, '.next', 'server', 'pages')
        const allFilesInDotNextServerPages = await fs
          .readdirSync(pagesFilesDir, {
            recursive: true,
          })
          .filter((item) => item.endsWith('.js'))
        for (const file of allFilesInDotNextServerPages) {
          const content = await fs.readFile(
            path.join(pagesFilesDir, file),
            'utf8'
          )
          allContent += content
        }

        expect(allContent).toMatch(/Hello.*?,.*?\n?.*?("|')undefined("|')/)
      })

      it('Does not replace `typeof window` for `node_modules` code', async () => {
        let allContent = ''
        const files = buildManifest.pages['/'].filter((item) =>
          item.endsWith('.js')
        )
        for (const file of files) {
          const content = await fs.readFile(
            path.join(appDir, '.next', file),
            'utf8'
          )
          allContent += content
        }
        expect(allContent).toMatch(/MyComp:.*?,.*?typeof window/)
      })
    }
  )
})
