import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

export async function recursiveReadDir(dir: string, filter: RegExp, arr: string[] = [], rootDirRegex: RegExp = new RegExp(`${dir}[\\/]`)) {
  const result = await readdir(dir)

  await Promise.all(result.map(async (part) => {
    const absolutePath = path.join(dir, part)
    const pathStat = await stat(absolutePath)

    if (pathStat.isDirectory()) {
      await recursiveReadDir(absolutePath, filter, arr, rootDirRegex)
      return
    }

    if (!filter.exec(part)) {
      return
    }

    arr.push(absolutePath.replace(rootDirRegex, ''))
  }))

  return arr
}
