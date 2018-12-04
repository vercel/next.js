import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import crypto from 'crypto'
import mkdirpOrig from 'mkdirp'
import findCacheDir from 'find-cache-dir'
import { promisify } from 'util'

import defaultTransform from './transform'

// Lazily instantiated when needed
let defaultCacheDirectory = null

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const gunzip = promisify(zlib.gunzip)
const gzip = promisify(zlib.gzip)
const mkdirp = promisify(mkdirpOrig)

/**
 * Read the contents from the compressed file.
 *
 * @async
 * @params {String} filename
 */
const defaultRead = async function (filename, compress) {
  const data = await readFile(filename + (compress ? '.gz' : ''))
  const content = compress ? await gunzip(data) : data

  return JSON.parse(content.toString())
}

/**
 * Write contents into a compressed file.
 *
 * @async
 * @params {String} filename
 * @params {String} result
 */
const defaultWrite = async function (filename, compress, result) {
  const content = JSON.stringify(result)

  const data = compress ? await gzip(content) : content
  return writeFile(filename + (compress ? '.gz' : ''), data)
}

/**
 * Build the filename for the cached file
 *
 * @params {String} source  File source code
 * @params {Object} options Options used
 *
 * @return {String}
 */
const filename = function (source, identifier, options) {
  const hash = crypto.createHash('md4')

  const contents = JSON.stringify({ source, options, identifier })

  hash.update(contents)

  return hash.digest('hex') + '.json'
}

/**
 * Handle the cache
 *
 * @params {String} directory
 * @params {Object} params
 */
const handleCache = async function (directory, params) {
  const {
    source,
    options = {},
    cacheIdentifier,
    cacheDirectory,
    cacheCompression,
    transform = defaultTransform,
    externalCache: { read = defaultRead, write = defaultWrite } = {}
  } = params

  const file = path.join(directory, filename(source, cacheIdentifier, options))

  try {
    // No errors mean that the file was previously cached
    // we just need to return it
    return await read(file, cacheCompression)
  } catch (err) {}

  const fallback =
    typeof cacheDirectory !== 'string' && directory !== os.tmpdir()

  if (directory) {
    // Make sure the directory exists.
    try {
      await mkdirp(directory)
    } catch (err) {
      if (fallback) {
        return handleCache(os.tmpdir(), params)
      }

      throw err
    }
  }

  // Otherwise just transform the file
  // return it to the user asap and write it in cache
  const result = await transform(source, options)

  try {
    await write(file, cacheCompression, result)
  } catch (err) {
    if (fallback) {
      // Fallback to tmpdir if node_modules folder not writable
      return handleCache(os.tmpdir(), params)
    }

    throw err
  }

  return result
}

/**
 * Retrieve file from cache, or create a new one for future reads
 *
 * @async
 * @param  {Object}   params
 * @param  {String}   params.directory            Directory to store cached files
 * @param  {String}   params.identifier           Unique identifier to bust cache
 * @param  {String}   params.source               Original contents of the file to be cached
 * @param  {Object}   params.options              Options to be given to the transform fn
 * @param  {Function} params.transform            Function that will transform the
 *                                                original file and whose result will be
 *                                                cached
 * @param  {Function} params.externalCache.read   Async function that can retrieve previously
 *                                                cached Babel parses.
 * @param  {Function} params.externalCache.write  Async function that can cache previously
 *                                                uncached Babel parses.
 *
 *
 * @example
 *
 *   cache({
 *     directory: '.tmp/cache',
 *     identifier: 'babel-loader-cachefile',
 *     cacheCompression: false,
 *     source: *source code from file*,
 *     options: {
 *       experimental: true,
 *       runtime: true
 *     },
 *     transform: function(source, options) {
 *       var content = *do what you need with the source*
 *       return content
 *     }
 *   }, function(err, result) {
 *
 *   })
 */
export default async function (params) {
  let directory

  if (
    params.externalCache &&
    params.externalCache.read &&
    params.externalCache.write
  ) {
    directory = ''
  } else if (typeof params.cacheDirectory === 'string') {
    directory = params.cacheDirectory
  } else {
    if (defaultCacheDirectory === null) {
      defaultCacheDirectory =
        findCacheDir({ name: 'babel-loader' }) || os.tmpdir()
    }

    directory = defaultCacheDirectory
  }

  return handleCache(directory, params)
}
