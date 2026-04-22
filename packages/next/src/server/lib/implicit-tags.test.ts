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
    {
      page: '/wiki/[slug]/page',
      pathname: '/wiki/ヤクルト',
      fallbackRouteParams: null,
      expectedTags: [
        '_N_T_/layout',
        '_N_T_/wiki/layout',
        '_N_T_/wiki/[slug]/layout',
        '_N_T_/wiki/[slug]/page',
        '_N_T_/wiki/%E3%83%A4%E3%82%AF%E3%83%AB%E3%83%88',
      ],
    },
    {
      page: '/wiki/[slug]/page',
      pathname: '/wiki/%E3%83%A4%E3%82%AF%E3%83%AB%E3%83%88',
      fallbackRouteParams: null,
      expectedTags: [
        '_N_T_/layout',
        '_N_T_/wiki/layout',
        '_N_T_/wiki/[slug]/layout',
        '_N_T_/wiki/[slug]/page',
        '_N_T_/wiki/%E3%83%A4%E3%82%AF%E3%83%AB%E3%83%88',
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
