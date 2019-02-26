// TODO: After deprecation of node 8 & 9 replace with fs-promise
import { readFile, writeFile, unlink } from 'fs'
import { promisify } from 'util'

const readFileAsync = promisify(readFile)
const writeFileAsync = promisify(writeFile)
const unlinkAsync = promisify(unlink)

const unrestoredFiles = new Set()

export default async function fsTimeMachine (filePath) {
  let orginalNull = false
  let originalContent
  let currentContent = ''
  try {
    originalContent = currentContent = await readFileAsync(filePath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    orginalNull = true
  }
  return {
    async write (content) {
      unrestoredFiles.add(this)
      currentContent = content
      return writeFileAsync(filePath, currentContent, 'utf8')
    },
    async replace (pattern, newValue) {
      unrestoredFiles.add(this)
      if (typeof pattern === 'string' && !currentContent.includes(pattern)) {
        const error = `Pattern '${pattern}' does not exist in file.`
        throw new Error(error)
      }
      currentContent = currentContent.replace(pattern, newValue)
      return writeFileAsync(filePath, currentContent, 'utf8')
    },
    async delete () {
      unrestoredFiles.add(this)
      return unlinkAsync(filePath)
    },
    async restore () {
      unrestoredFiles.delete(this)
      if (orginalNull) {
        try {
          await unlinkAsync(filePath)
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error
          }
          // File was deleted before
        }
      } else {
        await writeFileAsync(filePath, originalContent, 'utf8')
      }
    }
  }
}

fsTimeMachine.restore = async () => {
  for (const unrestoredFile of unrestoredFiles) {
    await unrestoredFile.restore()
  }
}
