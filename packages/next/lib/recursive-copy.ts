import path from 'path'
import fs from 'fs'
import { promisify } from 'util'
import { Sema } from 'async-sema'

const mkdir = promisify(fs.mkdir)
const stat = promisify(fs.stat)
const readdir = promisify(fs.readdir)
const copyFile = promisify(fs.copyFile)

const COPYFILE_EXCL = fs.constants.COPYFILE_EXCL

export async function recursiveCopy(
  source: string,
  dest: string,
  {
    concurrency = 32,
    overwrite = false,
    filter = () => true,
  }: {
    concurrency?: number
    overwrite?: boolean
    filter?(path: string): boolean
  } = {}
) {
  const cwdPath = process.cwd()
  const from = path.resolve(cwdPath, source)
  const to = path.resolve(cwdPath, dest)

  const sema = new Sema(concurrency)

  async function _copy(item: string) {
    const target = item.replace(from, to)
    const stats = await stat(item)

    await sema.acquire()

    if (stats.isDirectory()) {
      try {
        await mkdir(target)
      } catch (err) {
        // do not throw `folder already exists` errors
        if (err.code !== 'EEXIST') {
          throw err
        }
      }
      sema.release()
      const files = await readdir(item)
      await Promise.all(files.map(file => _copy(path.join(item, file))))
    } else if (
      stats.isFile() &&
      // before we send the path to filter
      // we remove the base path (from) and replace \ by / (windows)
      filter(item.replace(from, '').replace(/\\/g, '/'))
    ) {
      await copyFile(item, target, overwrite ? undefined : COPYFILE_EXCL)
      sema.release()
    }
  }

  await _copy(from)
}
