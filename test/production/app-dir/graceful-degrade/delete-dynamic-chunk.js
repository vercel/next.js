import fs from 'fs'
import path from 'path'

export function deleteBrowserDynamicChunks(next) {
  const clientChunkDir = path.join(next.testDir, '.next', 'static', 'chunks')
  const clientChunkFiles = fs
    .readdirSync(clientChunkDir)
    // filter out the js file that contains the text "large test content"
    .filter((filename) => {
      const filePath = path.join(clientChunkDir, filename)
      const isJsFile = filename.endsWith('.js')
      const fileContent = isJsFile
        ? fs.readFileSync(filePath, { encoding: 'utf8' })
        : ''

      return (
        isJsFile && fileContent && fileContent.includes('large test content')
      )
    })
    .map((file) => path.join(clientChunkDir, file))

  // Intended to log to help debugging tests
  console.log('Deleting client chunk files:', clientChunkFiles)
  // delete all chunk files
  clientChunkFiles.map((file) => fs.rmSync(file))
}
