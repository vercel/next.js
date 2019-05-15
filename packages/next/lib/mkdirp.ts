import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const stat = promisify(fs.stat)

// mkdir(dir, { resurive: true }) exists in node >= v12.0
// and is equivalent to mkdirp
const isRecursiveSupported =
  Number((process.version.match(/^v(\d+\.\d+)/) || [])[1]) >= 10.12

export async function mkdirp(dir: string) {
  if (isRecursiveSupported) {
    return mkdir(dir, { recursive: true })
  }

  dir = path.resolve(dir)

  try {
    await mkdir(dir)
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
  }
}

export function mkdirpSync(dir: string) {
  if (isRecursiveSupported) {
    return fs.mkdirSync(dir, { recursive: true })
  }

  dir = path.resolve(dir)

  try {
    fs.mkdirSync(dir)
  } catch (error) {
    // ENOENT means the parent directory does not exists
    if (error.code === 'ENOENT') {
      mkdirpSync(path.dirname(dir))
      mkdirpSync(dir)
      return
    }

    // if the error is something else, check if the dir already exists
    let stats
    try {
      stats = fs.statSync(dir)
    } catch (_) {}

    if (!stats || !stats.isDirectory()) {
      throw error
    }
  }
}
