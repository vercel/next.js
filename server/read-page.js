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

  let content = await fs.readFile(f, 'utf8')

  if (f.slice(-5) === '.json') {
    const { component } = JSON.parse(content)
    content = component
  }

  cache[f] = content
  return content
}

export default readPage
export const cache = {}

readPage.cache = cache
