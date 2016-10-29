import fs from 'mz/fs'
import resolve from './resolve'

/**
 * resolve a file like `require.resolve`,
 * and read and cache the file content
 */

async function read (path, base) {
  const resolved = await resolve(path, base)
  const file = resolved.file
  if (cache.hasOwnProperty(file)) {
    return {
      data: cache[file],
      params: resolved.params
    }
  }

  const data = await fs.readFile(file, 'utf8')
  cache[file] = data

  return {
    data,
    params: resolved.params
  }
}

export default read
export const cache = {}

read.cache = cache
