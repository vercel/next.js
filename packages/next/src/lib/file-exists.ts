import { existsSync, promises } from 'fs'
import isError from './is-error'

export enum FileType {
  File = 'file',
  Directory = 'directory',
}

import path from 'path'

export async function fileExists(
  fileName: string,
  type?: FileType,
  rootDir: string = process.cwd() // Default to current working directory
): Promise<boolean> {
  try {
    // Resolve the file path to ensure it is within the root directory
    const resolvedPath = path.resolve(rootDir, fileName)
    if (!resolvedPath.startsWith(rootDir)) {
      throw new Error('Access to the specified path is not allowed.')
    }

    if (type === FileType.File) {
      const stats = await promises.stat(resolvedPath)
      return stats.isFile()
    } else if (type === FileType.Directory) {
      const stats = await promises.stat(resolvedPath)
      return stats.isDirectory()
    }

    return existsSync(resolvedPath)
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
