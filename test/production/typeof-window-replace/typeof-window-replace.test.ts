import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('typeof window replace', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: path.join(__dirname, 'app'),
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    let buildManifest: any

    beforeAll(async () => {
      await next.build()
      buildManifest = JSON.parse(
        await next.readFile('.next/build-manifest.json')
      )
    })

    it('Replaces `typeof window` with object for client code', async () => {
      let allContent = ''
      const files = buildManifest.pages['/'].filter((item: string) =>
        item.endsWith('.js')
      )
      for (const file of files) {
        const content = await next.readFile(path.join('.next', file))
        allContent += content
      }
      expect(allContent).toMatch(/Hello.*?,.*?\n?.*?("|')object("|')/)
    })

    it('Replaces `typeof window` with undefined for server code', async () => {
      let allContent = ''
      const chunksDir = path.join(next.testDir, '.next', 'server', 'chunks')
      const allChunkFiles = fs
        .readdirSync(chunksDir, {
          recursive: true,
          encoding: 'utf-8',
        })
        .filter((item) => item.endsWith('.js'))
      for (const file of allChunkFiles) {
        const content = fs.readFileSync(path.join(chunksDir, file), 'utf8')
        allContent += content
      }

      const pagesDir = path.join(next.testDir, '.next', 'server', 'pages')
      const allPageFiles = fs
        .readdirSync(pagesDir, {
          recursive: true,
          encoding: 'utf-8',
        })
        .filter((item) => item.endsWith('.js'))
      for (const file of allPageFiles) {
        const content = fs.readFileSync(path.join(pagesDir, file), 'utf8')
        allContent += content
      }

      expect(allContent).toMatch(/Hello.*?,.*?\n?.*?("|')undefined("|')/)
    })

    it('Does not replace `typeof window` for `node_modules` code', async () => {
      let allContent = ''
      const files = buildManifest.pages['/'].filter((item: string) =>
        item.endsWith('.js')
      )
      for (const file of files) {
        const content = await next.readFile(path.join('.next', file))
        allContent += content
      }
      expect(allContent).toMatch(/MyComp:.*?,.*?typeof window/)
    })
  })
})
