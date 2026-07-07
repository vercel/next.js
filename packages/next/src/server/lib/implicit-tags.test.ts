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
      // Non-ASCII pathname must be percent-encoded so it can be safely
      // serialized into the `x-next-cache-tags` HTTP header. Surrogate-pair
      // emoji exercises run-based replacement (a per-code-unit regex would
      // throw `URIError`).
      page: '/[slug]/page',
      pathname: '/🎉',
      fallbackRouteParams: null,
      expectedTags: [
        '_N_T_/layout',
        '_N_T_/[slug]/layout',
        '_N_T_/[slug]/page',
        '_N_T_/%F0%9F%8E%89',
      ],
    },
    {
      // Already-encoded pathname must not be double-encoded. The encoder
      // is idempotent on ASCII input including `%xx` sequences.
      page: '/[slug]/page',
      pathname: '/%F0%9F%8E%89',
      fallbackRouteParams: null,
      expectedTags: [
        '_N_T_/layout',
        '_N_T_/[slug]/layout',
        '_N_T_/[slug]/page',
        '_N_T_/%F0%9F%8E%89',
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
