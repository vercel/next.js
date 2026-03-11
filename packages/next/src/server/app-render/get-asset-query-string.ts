import type { AppRenderContext } from './app-render'

const isDev = process.env.NODE_ENV === 'development'
const isTurbopack = !!process.env.TURBOPACK

// Memoize per request context — the result is identical for the same ctx
// and addTimestamp value, but the function is called 10+ times per request.
const cacheWithTimestamp = new WeakMap<object, string>()
const cacheWithoutTimestamp = new WeakMap<object, string>()

export function getAssetQueryString(
  ctx: AppRenderContext,
  addTimestamp: boolean
) {
  const cache = addTimestamp ? cacheWithTimestamp : cacheWithoutTimestamp
  const cached = cache.get(ctx)
  if (cached !== undefined) return cached

  let qs = ''

  // In development we add the request timestamp to allow react to
  // reload assets when a new RSC response is received.
  // Turbopack handles HMR of assets itself and react doesn't need to reload them
  // so this approach is not needed for Turbopack.
  const shouldAddVersion = isDev && !isTurbopack && addTimestamp
  if (shouldAddVersion) {
    qs += `?v=${ctx.requestTimestamp}`
  }

  if (ctx.sharedContext.clientAssetToken) {
    qs += `${shouldAddVersion ? '&' : '?'}dpl=${ctx.sharedContext.clientAssetToken}`
  }

  cache.set(ctx, qs)
  return qs
}
