import { constants, promises } from 'fs'
import isError from './is-error'

export enum FileType {
  File = 'file',
  Directory = 'directory',
}

export async function fileExists(
  fileName: string,
  type?: FileType
): Promise<boolean> {
  try {
    if (type === FileType.File) {
      const stats = await promises.stat(fileName)
      return stats.isFile()
    } else if (type === FileType.Directory) {
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
