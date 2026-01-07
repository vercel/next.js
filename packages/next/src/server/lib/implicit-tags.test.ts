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
      page: '',
      url: { pathname: '/', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/', '_N_T_/index'],
    },
    {
      page: '/',
      url: { pathname: '', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout'],
    },
    {
      page: '/page',
      url: { pathname: '', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/page'],
    },
    {
      page: '/page',
      url: { pathname: '/', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/page', '_N_T_/', '_N_T_/index'],
    },
    {
      page: '/page',
      url: { pathname: '/page', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/page'],
    },
    {
      page: '/index',
      url: { pathname: '/', search: '' },
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
      url: { pathname: '/hello', search: '' },
      fallbackRouteParams: null,
      expectedTags: ['_N_T_/layout', '_N_T_/hello/layout', '_N_T_/hello'],
    },
    {
      page: '/foo/bar/baz',
      url: { pathname: '/foo/bar/baz', search: '' },
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
    'for page $page with url $url and $fallback',
    async ({ page, url, fallbackRouteParams, expectedTags }) => {
      const result = await getImplicitTags(page, url, fallbackRouteParams)
      expect(result.tags).toEqual(expectedTags)
    }
  )
})
