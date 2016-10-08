import fs from 'mz/fs'
import resolve from './resolve'

const cache = {}

/**
 * resolve a file like `require.resolve`,
 * and read and cache the file content
 */

async function read (path) {
  const f = await resolve(path)
  let promise = cache[f]
  if (!promise) {
    promise = cache[f] = fs.readFile(f, 'utf8')
  }
  return promise
}

module.exports = read

exports.cache = cache
