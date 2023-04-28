import { headers } from '../../client/components/headers'
import { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import { getRevalidateHeaders } from './get-revalidate-headers'

export function makeRevalidateRequest(
  method: 'GET' | 'HEAD',
  path: string,
  store: StaticGenerationStore,
  ctx: {
    unstable_onlyGenerated?: boolean
  } = {},
  additionalHeaders: Record<string, string> = {}
) {
  const reqHeaders: Record<string, undefined | string | string[]> =
    store.incrementalCache?.requestHeaders || Object.fromEntries(headers())

  const host = reqHeaders['host']
  const proto = store.incrementalCache?.requestProtocol || 'https'

  // TODO: glob handling + blocking/soft revalidate
  const revalidateURL = `${proto}://${host}${path}`
  const newRequestHeaders = getRevalidateHeaders(store, ctx) as Record<
    string,
    string
  >

  for (const key of Object.keys(additionalHeaders)) {
    newRequestHeaders[key] = additionalHeaders[key]
  }
  const fetchIPv4v6 = (v6 = false): Promise<any> => {
    const curUrl = new URL(revalidateURL)
    const hostname = curUrl.hostname

    if (!v6 && hostname === 'localhost') {
      curUrl.hostname = '127.0.0.1'
    }
    return fetch(curUrl, {
      method,
      headers: newRequestHeaders,
    }).catch((err) => {
      if (err.code === 'ECONNREFUSED' && !v6) {
        return fetchIPv4v6(true)
      }
      throw err
    })
  }

  return fetchIPv4v6()
}
