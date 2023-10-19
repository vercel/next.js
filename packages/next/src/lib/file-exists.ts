import { existsSync, promises } from 'fs'
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
    }

    return existsSync(fileName)
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
