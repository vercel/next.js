import { constants, promises } from 'fs'
import isError from './is-error'

export async function fileExists(
  fileName: string,
  type?: 'file' | 'directory'
): Promise<boolean> {
  try {
    if (type === 'file') {
      const stats = await promises.stat(fileName)
      return stats.isFile()
    } else if (type === 'directory') {
      const stats = await promises.stat(fileName)
      return stats.isDirectory()
    } else {
      await promises.access(fileName, constants.F_OK)
    }
    return true
  } catch (err) {
    if (
      isError(err) &&
      (err.code === 'ENOENT' || err.code === 'ENAMETOOLONG')
    ) {
      return false
    }
    throw err
  }
}
