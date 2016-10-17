import fs from 'mz/fs'
import resolve from './resolve'

/**
 * resolve a file like `require.resolve`,
 * and read and cache the file content
 */

async function read (path) {
  const f = await resolve(path)
  if (cache.hasOwnProperty(f)) {
    return cache[f]
  }

  const data = fs.readFile(f, 'utf8')
  cache[f] = data
  return data
}

export default read
export const cache = {}

read.cache = cache
