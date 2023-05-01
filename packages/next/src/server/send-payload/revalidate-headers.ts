import type { ServerResponse } from 'http'
import type { BaseNextResponse } from '../base-http'
import type { PayloadOptions } from './index'

export function getRevalidateCacheControlHeader(
  options: PayloadOptions
): string {
  if (options.private || options.stateful) {
    return `private, no-cache, no-store, max-age=0, must-revalidate`
  } else if (typeof options.revalidate === 'number') {
    if (options.revalidate < 1) {
      throw new Error(
        `Invariant: invalid Cache-Control duration provided: ${options.revalidate} < 1`
      )
    }

    return `s-maxage=${options.revalidate}, stale-while-revalidate`
  } else if (options.revalidate === false) {
    return `s-maxage=31536000, stale-while-revalidate`
  }

  throw new Error(
    `Invariant: invalid revalidate option type: ${typeof options.revalidate}`
  )
}

export function setRevalidateHeaders(
  res: ServerResponse | BaseNextResponse,
  options: PayloadOptions
) {
  const header = getRevalidateCacheControlHeader(options)

  // If we're stateful, we don't want to override the header set by the user.
  if (!options.private && options.stateful && res.getHeader('Cache-Control')) {
    return
  }

  res.setHeader('Cache-Control', header)
}
