import fs from 'fs'
import { createNextDescribe } from 'e2e-utils'
import { join } from 'path'

createNextDescribe(
  'app-dir client-components-tree-shaking',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should tree shake client components in browser bundle', async () => {
      const clientChunksDir = join(
        next.testDir,
        '.next',
        'static',
        'chunks',
        'app'
      )
      const staticChunksDirents = fs.readdirSync(clientChunksDir, {
        withFileTypes: true,
      })
      const chunkContents = staticChunksDirents
        .filter((dirent) => dirent.isFile())
        .map((chunkDirent) =>
          fs.readFileSync(join(chunkDirent.path, chunkDirent.name), 'utf8')
        )
      expect(
        chunkContents.some((content) =>
          content.includes('client-comp-imported')
        )
      ).toBe(true)
      expect(
        chunkContents.every((content) => content.includes('client-comp-unused'))
      ).toBe(false)
    })
  }
)
