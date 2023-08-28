import type { HandleOutputCtx } from '../handle-output'
import { getExtension } from '../../../serve-static'

export async function handleImage(ctx: HandleOutputCtx) {
  const {
    req,
    res,
    dev,
    nextConfig,
    distDir,
    parsedUrl,
    responseCache,
    requestHandler,
  } = ctx

  if (nextConfig.output === 'export') {
    res.statusCode = 400
    res.end('Bad Request')
    return
  }

  const {
    ImageOptimizerCache,
    getHash,
    sendResponse,
    ImageError,
    imageOptimizer,
  } =
    require('../../../image-optimizer') as typeof import('../../../image-optimizer')

  const imageOptimizerCache = new ImageOptimizerCache({
    distDir,
    nextConfig,
  })
  const imagesConfig = nextConfig.images

  if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
    const err = new Error(`Not Found`)
    ;(err as any).statusCode = 404
    throw err
  }
  const paramsResult = ImageOptimizerCache.validateParams(
    req,
    parsedUrl.query,
    nextConfig,
    dev
  )

  if ('errorMessage' in paramsResult) {
    res.statusCode = 400
    res.end(paramsResult.errorMessage)
    return
  }
  const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult)

  try {
    const cacheEntry = await responseCache.get(
      cacheKey,
      async () => {
        const { buffer, contentType, maxAge } = await imageOptimizer(
          req,
          res,
          paramsResult,
          nextConfig,
          dev,
          requestHandler
        )
        const etag = getHash([buffer])

        return {
          value: {
            kind: 'IMAGE',
            buffer,
            etag,
            extension: getExtension(contentType) as string,
          },
          revalidate: maxAge,
        }
      },
      {
        incrementalCache: imageOptimizerCache,
      }
    )

    if (cacheEntry?.value?.kind !== 'IMAGE') {
      throw new Error('invariant did not get entry from image response cache')
    }
    sendResponse(
      req,
      res,
      paramsResult.href,
      cacheEntry.value.extension,
      cacheEntry.value.buffer,
      paramsResult.isStatic,
      cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT',
      imagesConfig,
      cacheEntry.revalidate || 0,
      dev
    )
  } catch (err) {
    if (err instanceof ImageError) {
      res.statusCode = err.statusCode
      res.end(err.message)
      return {
        finished: true,
      }
    }
    throw err
  }
  return { finished: true }
}
