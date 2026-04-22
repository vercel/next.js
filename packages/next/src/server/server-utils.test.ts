import type { IncomingMessage } from 'http'
import type { NextUrlWithParsedQuery } from './request-meta'

import {
  getPagesRouterRewriteHydrationQueries,
  getServerUtils,
} from './server-utils'

describe('getParamsFromRouteMatches', () => {
  it('should return nothing for a non-dynamic route', () => {
    const { getParamsFromRouteMatches } = getServerUtils({
      page: '/',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: false,
      caseSensitive: false,
    })

    const params = getParamsFromRouteMatches('nxtPslug=hello-world')
    expect(params).toEqual(null)
  })

  it('should return the params from the route matches', () => {
    const { getParamsFromRouteMatches } = getServerUtils({
      page: '/[slug]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const params = getParamsFromRouteMatches('nxtPslug=hello-world')
    expect(params).toEqual({ slug: 'hello-world' })
  })

  it('should handle optional params', () => {
    const { getParamsFromRouteMatches } = getServerUtils({
      page: '/[slug]/[[...optional]]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    // Missing optional param
    let params = getParamsFromRouteMatches('nxtPslug=hello-world')
    expect(params).toEqual({ slug: 'hello-world' })

    // Providing optional param
    params = getParamsFromRouteMatches(
      'nxtPslug=hello-world&nxtPoptional=im-optional'
    )
    expect(params).toEqual({ slug: 'hello-world', optional: ['im-optional'] })
  })

  it('should handle rest params', () => {
    const { getParamsFromRouteMatches } = getServerUtils({
      page: '/[slug]/[...rest]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    // Missing rest param
    let params = getParamsFromRouteMatches('nxtPslug=hello-world')
    expect(params).toEqual(null)

    // Providing rest param
    params = getParamsFromRouteMatches(
      'nxtPslug=hello-world&nxtPrest=im-the/rest'
    )
    expect(params).toEqual({ slug: 'hello-world', rest: ['im-the', 'rest'] })
  })
})

describe('normalizeDynamicRouteParams', () => {
  it('should reject encoded default placeholders for dynamic params', () => {
    const { normalizeDynamicRouteParams } = getServerUtils({
      page: '/[teamSlug]/[project]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = normalizeDynamicRouteParams(
      {
        teamSlug: '%5BteamSlug%5D',
        project: '%5Bproject%5D',
      },
      true
    )

    expect(result).toEqual({
      params: {},
      hasValidParams: false,
    })
  })

  it('should reject doubly encoded default placeholders for dynamic params', () => {
    const { normalizeDynamicRouteParams } = getServerUtils({
      page: '/[teamSlug]/[project]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = normalizeDynamicRouteParams(
      {
        teamSlug: '%255BteamSlug%255D',
        project: '%255Bproject%255D',
      },
      true
    )

    expect(result).toEqual({
      params: {},
      hasValidParams: false,
    })
  })

  it('should continue accepting regular dynamic values', () => {
    const { normalizeDynamicRouteParams } = getServerUtils({
      page: '/[teamSlug]/[project]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = normalizeDynamicRouteParams(
      {
        teamSlug: 'vercel',
        project: 'nextjs',
      },
      true
    )

    expect(result).toEqual({
      params: {
        teamSlug: 'vercel',
        project: 'nextjs',
      },
      hasValidParams: true,
    })
  })

  it('should not decode matched params beyond the route matcher decode', () => {
    const { normalizeDynamicRouteParams } = getServerUtils({
      page: '/[teamSlug]/[project]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = normalizeDynamicRouteParams(
      {
        teamSlug: 'acme',
        project: '%23hash',
      },
      true
    )

    expect(result).toEqual({
      params: {
        teamSlug: 'acme',
        project: '%23hash',
      },
      hasValidParams: true,
    })
  })

  it('should not reject non-placeholder values that only contain decoded placeholder text', () => {
    const { normalizeDynamicRouteParams } = getServerUtils({
      page: '/[teamSlug]/[project]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = normalizeDynamicRouteParams(
      {
        teamSlug: 'acme',
        project: '%5Bproject%5D-suffix',
      },
      true
    )

    expect(result).toEqual({
      params: {
        teamSlug: 'acme',
        project: '%5Bproject%5D-suffix',
      },
      hasValidParams: true,
    })
  })
})

describe('handleRewrites', () => {
  it('should report query-only rewrites as matched rewrites', () => {
    const { handleRewrites } = getServerUtils({
      page: '/',
      basePath: '',
      rewrites: {
        beforeFiles: [],
        afterFiles: [
          {
            source: '/rewrite',
            destination: '/?foo=bar',
          },
        ],
        fallback: [],
      },
      i18n: undefined,
      pageIsDynamic: false,
      caseSensitive: false,
    })

    const result = handleRewrites(
      {
        headers: {},
      } as IncomingMessage,
      {
        pathname: '/rewrite',
        query: {},
      } as NextUrlWithParsedQuery
    )

    expect(result.matchedRewrite).toBe(true)
    expect(result.rewrittenParsedUrl.pathname).toBe('/')
    expect(result.rewrittenParsedUrl.query).toEqual({ foo: 'bar' })
  })
})

describe('getPagesRouterRewriteHydrationQueries', () => {
  it('should serialize params only for getStaticProps pages in non-experimental mode', () => {
    expect(
      getPagesRouterRewriteHydrationQueries(
        true,
        false,
        { foo: 'bar' },
        { slug: ['a', 'b'] }
      )
    ).toEqual({
      serializedQuery: { slug: ['a', 'b'] },
      reconciledQuery: { foo: 'bar', slug: ['a', 'b'] },
    })
  })

  it('should preserve the reconciled query for experimental compile static pages', () => {
    expect(
      getPagesRouterRewriteHydrationQueries(
        true,
        true,
        { foo: 'bar' },
        {
          slug: 'a',
        }
      )
    ).toEqual({
      serializedQuery: { foo: 'bar', slug: 'a' },
      reconciledQuery: { foo: 'bar', slug: 'a' },
    })
  })

  it('should preserve the reconciled query for non-static pages', () => {
    expect(
      getPagesRouterRewriteHydrationQueries(
        false,
        false,
        { foo: 'bar' },
        {
          slug: 'a',
        }
      )
    ).toEqual({
      serializedQuery: { foo: 'bar', slug: 'a' },
      reconciledQuery: { foo: 'bar', slug: 'a' },
    })
  })

  it('should treat missing params as an empty query object', () => {
    expect(
      getPagesRouterRewriteHydrationQueries(true, false, { foo: 'bar' })
    ).toEqual({
      serializedQuery: {},
      reconciledQuery: { foo: 'bar' },
    })
  })
})
