import path from 'path'
import fs from 'fs'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const stat = promisify(fs.stat)

export default async function mkdirp(dir: string) {
  dir = path.resolve(dir)

  try {
    await mkdir(dir)
    return
  } catch (error) {
    // ENOENT means the parent directory does not exists
    if (error.code === 'ENOENT') {
      await mkdirp(path.dirname(dir))
      await mkdirp(dir)
      return
    }

    // if the error is something else, check if the dir already exists
    let stats
    try {
      stats = await stat(dir)
    } catch (_) {}

    if (!stats || !stats.isDirectory()) {
      throw error
    }

    return
  }
}
