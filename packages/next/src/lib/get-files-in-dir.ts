import { join } from 'path'
import fs from 'fs/promises'
import type { Dirent, StatsBase } from 'fs'

export async function getFilesInDir(path: string): Promise<string[]> {
  const dir = await fs.opendir(path)
  const results = []

  for await (const file of dir) {
    let resolvedFile: Dirent | StatsBase<number> = file

    if (file.isSymbolicLink()) {
      resolvedFile = await fs.stat(join(path, file.name))
    }

    if (resolvedFile.isFile()) {
      results.push(file.name)
    }
  }

  return results
}
