import { join } from 'path'
import fs from 'fs/promises'
import type { Dirent, StatsBase } from 'fs'

export async function getFilesInDir(path: string): Promise<Set<string>> {
  const dir = await fs.opendir(path)
  const results = new Set<string>()

  for await (const file of dir) {
    let resolvedFile: Dirent | StatsBase<number> = file

    if (file.isSymbolicLink()) {
      try {
        resolvedFile = await fs.stat(join(path, file.name))
      } catch (err: any) {
        // A dangling symlink (its target does not exist) can't be a file we
        // are looking for, so skip it instead of failing.
        if (err.code === 'ENOENT') continue
        throw err
      }
    }

    if (resolvedFile.isFile()) {
      results.add(file.name)
    }
  }

  return results
}
