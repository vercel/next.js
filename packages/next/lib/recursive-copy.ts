import path from 'path'
import { promises, constants } from 'fs'
import { Sema } from 'next/dist/compiled/async-sema'

const COPYFILE_EXCL = constants.COPYFILE_EXCL

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
): Promise<void> {
  const cwdPath = process.cwd()
  const from = path.resolve(cwdPath, source)
  const to = path.resolve(cwdPath, dest)

  const sema = new Sema(concurrency)

  async function _copy(item: string): Promise<void> {
    const target = item.replace(from, to)
    const stats = await promises.stat(item)

    await sema.acquire()

    if (stats.isDirectory()) {
      try {
        await promises.mkdir(target)
      } catch (err) {
        // do not throw `folder already exists` errors
        if (err.code !== 'EEXIST') {
          throw err
        }
      }
      sema.release()
      const files = await promises.readdir(item)
      await Promise.all(files.map((file) => _copy(path.join(item, file))))
    } else if (
      stats.isFile() &&
      // before we send the path to filter
      // we remove the base path (from) and replace \ by / (windows)
      filter(item.replace(from, '').replace(/\\/g, '/'))
    ) {
      await promises.copyFile(
        item,
        target,
        overwrite ? undefined : COPYFILE_EXCL
      )
      sema.release()
    }
  }

  await _copy(from)
}
