import { setCacheBustingSearchParam } from './set-cache-busting-search-param'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
} from '../app-router-headers'

describe('setCacheBustingSearchParam', () => {
  it('should append cache-busting search parameter to URL without existing search params', () => {
    const url = new URL('https://example.com/path')
    const headers = {
      [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: 'segment-1',
      [NEXT_ROUTER_STATE_TREE_HEADER]: 'state-tree-1',
    } as const

    setCacheBustingSearchParam(url, headers)
    expect(url.toString()).toMatch(
      /https:\/\/example\.com\/path\?_rsc=[a-z0-9]+$/
    )
  })

  it('should append cache-busting search parameter to URL with existing search params', () => {
    const url = new URL('https://example.com/path?query=1')
    const headers = {
      [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: 'segment-2',
      [NEXT_ROUTER_STATE_TREE_HEADER]: 'state-tree-2',
    } as const

    setCacheBustingSearchParam(url, headers)
    expect(url.toString()).toMatch(
      /https:\/\/example\.com\/path\?query=1&_rsc=[a-z0-9]+$/
    )
  })

  it('should generate unique cache key based on headers', () => {
    const url = new URL('https://example.com/path')
    const headers1 = {
      [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: 'segment-3',
      [NEXT_ROUTER_STATE_TREE_HEADER]: 'state-tree-3',
    } as const

    const headers2 = {
      [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: 'segment-4',
      [NEXT_ROUTER_STATE_TREE_HEADER]: 'state-tree-4',
      [NEXT_URL]: 'https://example.com/next-url-2',
    } as const

    setCacheBustingSearchParam(url, headers1)
    const url1String = url.toString()

    setCacheBustingSearchParam(url, headers2)
    const url2String = url.toString()

    expect(url1String).not.toEqual(url2String)
  })

  it('should append cache-busting search parameter to URL with existing search params containing %20', () => {
    const url = new URL('https://example.com/path?query=apple%20watch')
    const headers = {
      [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: 'segment-5',
      [NEXT_ROUTER_STATE_TREE_HEADER]: 'state-tree-5',
      [NEXT_URL]: 'https://example.com/next-url',
    } as const

    setCacheBustingSearchParam(url, headers)

    // Ensure %20 is not automatically decoded
    expect(url.toString()).toMatch(
      /https:\/\/example\.com\/path\?query=apple%20watch&_rsc=[a-z0-9]+$/
    )
  })
})
