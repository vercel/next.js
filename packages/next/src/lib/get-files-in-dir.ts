import type FsType from 'fs'
import { join } from 'path'

export async function getFilesInDir(
  path: string,
  fs: Pick<typeof FsType.promises, 'readdir' | 'stat'>
): Promise<string[]> {
  const files = await fs.readdir(path)
  const results: string[] = []

  await Promise.all(
    files.map(async (file) => {
      const fullPath = join(path, file)
      const resolvedFile = await fs.stat(fullPath)

      if (resolvedFile.isFile()) {
        results.push(file)
      }
    })
  )

  return results
}
