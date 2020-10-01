/**
 * Original Filesystem Cache implementation by babel-loader
 * Licensed under the MIT License
 *
 * @see https://github.com/babel/babel-loader/commits/master/src/fs-cache.js
 * @see https://github.com/babel/babel-loader/commits/master/src/cache.js
 */

/**
 * Filesystem Cache
 *
 * Given a file and a transform function, cache the result into files
 * or retrieve the previously cached files if the given file is already known.
 *
 * @see https://github.com/babel/babel-loader/issues/34
 * @see https://github.com/babel/babel-loader/pull/41
 */
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { promisify } from 'util'
import zlib from 'zlib'
import { createHash } from 'crypto'

// @ts-ignore
import findCacheDir from 'find-cache-dir'
import { NextLintResult } from './linter'

// Lazily instantiated when needed
let defaultCacheDirectory: string | null = null

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const gunzip = promisify(zlib.gunzip)
const gzip = promisify(zlib.gzip)

const read = async (filename: string, compress: Boolean) => {
  const data = await readFile(filename + (compress ? '.gz' : ''))
  const content = (compress ? await gunzip(data) : data) as Buffer

  return JSON.parse(content.toString())
}

const write = async (filename: string, compress: boolean, result: string) => {
  const content = JSON.stringify(result)

  const data = compress ? await gzip(content) : content
  return writeFile(filename + (compress ? '.gz' : ''), data)
}

const filename = (source: string, identifier: string, options: any) => {
  const hash = createHash('md4')

  const contents = JSON.stringify({ source, options, identifier })

  hash.update(contents)

  return `${hash.digest('hex')}.json`
}

const handleCache = async (
  directory: string,
  params: any
): Promise<NextLintResult> => {
  const {
    source,
    options = {},
    transform,
    cacheIdentifier,
    cacheDirectory,
    cacheCompression,
  } = params

  const file = join(directory, filename(source, cacheIdentifier, options))

  try {
    // No errors mean that the file was previously cached
    // we just need to return it
    const report = await read(file, cacheCompression)

    return { report }
    // eslint-disable-next-line no-empty
  } catch (err) {}

  const fallback =
    typeof cacheDirectory !== 'string' && directory !== os.tmpdir()

  // Make sure the directory exists.
  try {
    fs.mkdirSync(directory, { recursive: true })
  } catch (err) {
    if (fallback) {
      return handleCache(os.tmpdir(), params)
    }

    throw err
  }

  // Otherwise just transform the file
  // return it to the user asap and write it in cache
  const { report, ast } = await transform(source, options)

  try {
    await write(file, cacheCompression, report)
  } catch (err) {
    if (fallback) {
      // Fallback to tmpdir if node_modules folder not writable
      return handleCache(os.tmpdir(), params)
    }

    throw err
  }
  return { report, ast }
}

/**
 * Retrieve file from cache, or create a new one for future reads
 *
 * @async
 * @param  {Object}   params
 * @param  {String}   params.cacheDirectory  Directory to store cached files
 * @param  {String}   params.cacheIdentifier Unique identifier to bust cache
 * @param  {Boolean}  params.cacheCompression
 * @param  {String}   params.source   Original contents of the file to be cached
 * @param  {Object}   params.options  Options to be given to the transform fn
 * @param  {Function} params.transform  Function that will transform the
 *                                      original file and whose result will be
 *                                      cached
 *
 * @example
 *
 *   cache({
 *     cacheDirectory: '.tmp/cache',
 *     cacheIdentifier: 'babel-loader-cachefile',
 *     cacheCompression: true,
 *     source: *source code from file*,
 *     options: {
 *       experimental: true,
 *       runtime: true
 *     },
 *     transform: function(source, options) {
 *       var content = *do what you need with the source*
 *       return content;
 *     }
 *   });
 */

export default async (params: any) => {
  let directory

  if (typeof params.cacheDirectory === 'string') {
    directory = params.cacheDirectory
  } else {
    if (defaultCacheDirectory === null) {
      defaultCacheDirectory =
        findCacheDir({ name: 'next-eslint-loader' }) || os.tmpdir()
    }

    directory = defaultCacheDirectory
  }

  return handleCache(directory, params)
}
