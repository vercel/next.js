import { createHash } from 'crypto'
import { trace } from '../../../../../telemetry/trace'
import transform from './transform'
import cacache from 'next/dist/compiled/cacache'

async function read(cacheDirectory, etag) {
  const cachedResult = await trace('read-cache-file').traceAsyncFn(() =>
    cacache.get(cacheDirectory, etag)
  )
  return JSON.parse(cachedResult.data)
}

function write(cacheDirectory, etag, data) {
  return trace('write-cache-file').traceAsyncFn(() =>
    cacache.put(cacheDirectory, etag, JSON.stringify(data))
  )
}

const etag = function (source, identifier, options) {
  return trace('etag').traceFn(() => {
    const hash = createHash('md4')

    const contents = JSON.stringify({ source, options, identifier })

    hash.update(contents)

    return hash.digest('hex')
  })
}

export default async function handleCache(params) {
  const span = trace('handle-cache')

  return span.traceAsyncFn(async () => {
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
    const result = await trace('transform').traceAsyncFn(async () => {
      return transform(source, options)
    })

    await write(cacheDirectory, file, result)

    return result
  })
}
