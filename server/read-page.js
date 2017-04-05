import fs from 'mz/fs'
import resolve from './resolve'

/**
 * resolve a JSON page like `require.resolve`,
 * and read and cache the file content
 */

async function readPage (path) {
  const f = await resolve(path)
  if (cache.hasOwnProperty(f)) {
    return cache[f]
  }

  const source = await fs.readFile(f, 'utf8')
  cache[f] = source
  return source
}

export default readPage
export const cache = {}

readPage.cache = cache
