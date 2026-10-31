import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
} from '../app-router-headers'
import { setCacheBustingSearchParam } from './set-cache-busting-search-param'
import { computeLegacyCacheBustingSearchParam } from '../../../shared/lib/router/utils/cache-busting-search-param'

describe('setCacheBustingSearchParam', () => {
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'crypto'
  )

  afterEach(() => {
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor)
    }
  })

  it('falls back to the legacy hash when Web Crypto is unavailable', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    })

    const headers = {
      [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: '/_tree',
      [NEXT_ROUTER_STATE_TREE_HEADER]: '%5B%22%22%2C%7B%7D%5D',
      [NEXT_URL]: '/pcsta0',
    } as const
    const url = new URL('https://example.com/')

    await setCacheBustingSearchParam(url, headers)

    expect(url.searchParams.get(NEXT_RSC_UNION_QUERY)).toBe(
      computeLegacyCacheBustingSearchParam(
        headers[NEXT_ROUTER_PREFETCH_HEADER],
        headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER],
        headers[NEXT_ROUTER_STATE_TREE_HEADER],
        headers[NEXT_URL]
      )
    )
  })
})
