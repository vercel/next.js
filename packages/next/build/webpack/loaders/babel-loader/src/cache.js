import { createHash } from 'crypto'
import { tracer, traceAsyncFn } from '../../../../tracer'
import transform from './transform'
import cacache from 'next/dist/compiled/cacache'

async function read(cacheDirectory, etag) {
  const cachedResult = await traceAsyncFn(
    tracer.startSpan('read-cache-file'),
    async () => await cacache.get(cacheDirectory, etag)
  )

  return JSON.parse(cachedResult.data)
}

function write(cacheDirectory, etag, data) {
  return cacache.put(cacheDirectory, etag, JSON.stringify(data))
}

const etag = function (source, identifier, options) {
  const hash = createHash('md4')

  const contents = JSON.stringify({ source, options, identifier })

  hash.update(contents)

  return hash.digest('hex')
}

export default async function handleCache(params) {
  const span = tracer.startSpan('handle-cache')
  return traceAsyncFn(span, async () => {
    const { source, options = {}, cacheIdentifier, cacheDirectory } = params

    const file = etag(source, cacheIdentifier)

    try {
      // No errors mean that the file was previously cached
      // we just need to return it
      const res = await read(cacheDirectory, file)
      span.setAttribute('cache', res ? 'HIT' : 'MISS')
      return res
    } catch (err) {}

    // Otherwise just transform the file
    // return it to the user asap and write it in cache
    const result = await traceAsyncFn(
      tracer.startSpan('transform'),
      async () => {
        return transform(source, options)
      }
    )

    await write(cacheDirectory, file, result)

    return result
  })
}
