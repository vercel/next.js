import type { ServerResponse } from 'http'
import type { BaseNextResponse } from '../base-http'
import type { PayloadOptions } from './index'

function isResponse(
  res: ServerResponse | BaseNextResponse | Headers
): res is ServerResponse | BaseNextResponse {
  return 'setHeader' in res && typeof res.setHeader === 'function'
}

function adapt(
  res: ServerResponse | BaseNextResponse | Headers
): Pick<Headers, 'has' | 'set'> {
  if (isResponse(res)) {
    return {
      has: res.hasHeader.bind(res),
      set: res.setHeader.bind(res),
    }
  }

  return res
}

export function setRevalidateHeaders(
  res: ServerResponse | BaseNextResponse | Headers,
  options: PayloadOptions
) {
  const headers = adapt(res)
  if (options.private || options.stateful) {
    if (options.private || !headers.has('Cache-Control')) {
      headers.set(
        'Cache-Control',
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
    }
  } else if (typeof options.revalidate === 'number') {
    if (options.revalidate < 1) {
      throw new Error(
        `invariant: invalid Cache-Control duration provided: ${options.revalidate} < 1`
      )
    }

    headers.set(
      'Cache-Control',
      `s-maxage=${options.revalidate}, stale-while-revalidate`
    )
  } else if (options.revalidate === false) {
    headers.set('Cache-Control', 's-maxage=31536000, stale-while-revalidate')
  }
}
