import fs from 'mz/fs'
import resolve from './resolve'

const cache = {}

/**
 * resolve a file like `require.resolve`,
 * and read and cache the file content
 */

async function read (path, { mfs }) {
  const f = await (mfs ? resolveFromMFS(path, mfs) : resolve(path))
  if (mfs) {
    return mfs.readFileSync(f, 'utf8')
  } else {
    let promise = cache[f]
    if (!promise) {
      promise = cache[f] = fs.readFile(f, 'utf8')
    }
    return promise
  }
}

function resolveFromMFS (path, mfs) {
  const isFile = (file, cb) => {
    if (!mfs.existsSync(file)) return cb(null, false)

    let stat
    try {
      stat = mfs.statSync(file)
    } catch (err) {
      return cb(err)
    }
    cb(null, stat.isFile() || stat.isFIFO())
  }
  const readFile = mfs.readFile.bind(mfs)
  return resolve(path, { isFile, readFile })
}

module.exports = read

exports.cache = cache
