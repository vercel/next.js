import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

export type pathCallback = (name: string, absolute: string) => Promise<boolean>

/**
 * Recursively read directory
 * @param  {string} dir Directory to read
 * @param  {string[]=[]} arr This doesn't have to be provided, it's used for the recursion
 * @param  {string=dir`} rootDir Used to replace the initial path, only the relative path is left, it's faster than path.relative.
 * @param  {(string, string) => boolean} dirCallback Called when a directory is found with the name and the absolute path, return true to read contents or false to hit fileCallback
 * @param  {(string, string) => boolean} fileCallback Called when a file is found with the name and the absolute path, return true to include file in resulting array
 * @param  {(string, string) => boolean} completeCallback Called when a directory has finished being read
 * @returns Promise array holding all relative paths
 */
export async function recursiveReadDir(dir: string, arr: string[] = [], rootDir: string = dir, fileCallback?: pathCallback, dirCallback?: pathCallback, completeCallback?: pathCallback): Promise<string[]> {
  const result = await readdir(dir)

  await Promise.all(result.map(async (part: string) => {
    const absolutePath = join(dir, part)
    const pathStat = await stat(absolutePath)

    if (pathStat.isDirectory() && (!dirCallback || await dirCallback(part, absolutePath))) {
      await recursiveReadDir(absolutePath, arr, rootDir, dirCallback, fileCallback, completeCallback)
      if (completeCallback) completeCallback(part, absolutePath)
      return
    }

    if (fileCallback && await fileCallback(part, absolutePath)) {
      return
    }

    arr.push(absolutePath.replace(rootDir, ''))
  }))

  return arr
}
