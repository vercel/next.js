import fs from 'fs'
import { listClientChunks } from 'next-test-utils'
import path from 'path'

export async function deleteBrowserDynamicChunks(next) {
  const distDir = path.join(next.testDir, '.next')
  const clientChunkFiles = (await listClientChunks(distDir))
    .map((file) => path.join(distDir, file))
    // filter out the js file that contains the text "large test content"
    .filter((filePath) => {
      const isJsFile = filePath.endsWith('.js')
      const fileContent = isJsFile
        ? fs.readFileSync(filePath, { encoding: 'utf8' })
        : ''

      return (
        isJsFile && fileContent && fileContent.includes('large test content')
      )
    })

  // Intended to log to help debugging tests
  console.log('Deleting client chunk files:', clientChunkFiles)
  // delete all chunk files
  clientChunkFiles.map((file) => fs.rmSync(file))
}
