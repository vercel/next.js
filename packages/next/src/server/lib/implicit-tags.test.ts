import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import { getImplicitTags } from './implicit-tags'

describe('getImplicitTags()', () => {
  it.each<{
    page: string
    pathname: string
    fallbackRouteParams: null | OpaqueFallbackRouteParams
    expectedTags: string[]
  }>([
    {
      page: '/',
      pathname: '/',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/', '_N_T_/index'],
    },
    {
      page: '',
      pathname: '/',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/', '_N_T_/index'],
    },
    {
      page: '/',
      pathname: '',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout'],
    },
    {
      page: '/page',
      pathname: '',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/page'],
    },
    {
      page: '/page',
      pathname: '/',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/page', '_N_T_/', '_N_T_/index'],
    },
    {
      page: '/page',
      pathname: '/page',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/page'],
    },
    {
      page: '/index',
      pathname: '/',
      fallbackRouteParams: null,
      expectedTags: [
        '_N_T_/layout',
        '_N_T_/index/layout',
        '_N_T_/',
        '_N_T_/index',
      ],
    },
    {
      page: '/hello',
      pathname: '/hello',
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/hello/layout', '_N_T_/hello'],
    },
    {
      page: '/foo/bar/baz',
      pathname: '/foo/bar/baz',
      fallbackRouteParams: null,
      expectedTags: [
        '_N_T_/layout',
        '_N_T_/foo/layout',
        '_N_T_/foo/bar/layout',
        '_N_T_/foo/bar/baz/layout',
        '_N_T_/foo/bar/baz',
      ],
    },
  ])(
    'for page $page with pathname $pathname',
    async ({ page, pathname, fallbackRouteParams, expectedTags }) => {
      const result = await getImplicitTags(page, pathname, fallbackRouteParams)
      expect(result.tags).toEqual(expectedTags)
    }
  )
})
