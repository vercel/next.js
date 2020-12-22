/**
 * Filesystem Cache
 *
 * Given a file and a transform function, cache the result into files
 * or retrieve the previously cached files if the given file is already known.
 *
 * @see https://github.com/babel/babel-loader/issues/34
 * @see https://github.com/babel/babel-loader/pull/41
 */
import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { tracer, traceAsyncFn, traceFn } from '../../../../tracer'
import transform from './transform'

/**
 * Read the contents from the compressed file.
 *
 * @async
 * @params {String} filename
 * @params {Boolean} compress
 */
const read = async function (filename) {
  const data = await traceAsyncFn(
    tracer.startSpan('read-cache-file'),
    async () => await fs.readFile(filename)
  )

  return traceFn(tracer.startSpan('parse-data'), () =>
    JSON.parse(data.toString())
  )
}

/**
 * Write contents into a compressed file.
 *
 * @async
 * @params {String} filename
 * @params {Boolean} compress
 * @params {String} result
 */
const write = async function (filename, result) {
  const content = JSON.stringify(result)

  return await fs.writeFile(filename, content)
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
  const hash = createHash('md4')

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
export default async function handleCache(params) {
  const span = tracer.startSpan('handle-cache')
  return traceAsyncFn(span, async () => {
    const { source, options = {}, cacheIdentifier, cacheDirectory } = params

    const file = join(
      cacheDirectory,
      filename(source, cacheIdentifier, options)
    )

    try {
      // No errors mean that the file was previously cached
      // we just need to return it
      const res = await read(file)
      span.setAttribute('cache', res ? 'HIT' : 'MISS')
      return res
    } catch (err) {}

    // Make sure the directory exists.
    try {
      await fs.mkdir(cacheDirectory, { recursive: true })
    } catch (err) {
      throw err
    }

    // Otherwise just transform the file
    // return it to the user asap and write it in cache
    const result = await traceAsyncFn(
      tracer.startSpan('transform'),
      async () => {
        return transform(source, options)
      }
    )

    try {
      await write(file, result)
    } catch (err) {
      throw err
    }

    return result
  })
}
