import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import { getImplicitTags } from './implicit-tags'

describe('getImplicitTags()', () => {
  it.each<{
    page: string
    url: { pathname: string; search: string }
    fallbackRouteParams: null | OpaqueFallbackRouteParams
    expectedTags: string[]
  }>([
    {
      page: '/',
      url: { pathname: '/', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/', '_N_T_/index'],
    },
    {
      page: '/hello',
      url: { pathname: '/hello', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/hello/layout', '_N_T_/hello'],
    },
  ])(
    'for page $page with url $url and $fallback',
    async ({ page, url, fallbackRouteParams, expectedTags }) => {
      const result = await getImplicitTags(page, url, fallbackRouteParams)
      expect(result.tags).toEqual(expectedTags)
    }
  )
})
