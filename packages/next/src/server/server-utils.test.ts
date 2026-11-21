import type { IncomingMessage } from 'http'
import type { Rewrite } from '../lib/load-custom-routes'
import type { NextUrlWithParsedQuery } from './request-meta'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { getServerUtils } from './server-utils'

jest.mock('next/dist/compiled/path-to-regexp', () => {
  const actual = jest.requireActual('next/dist/compiled/path-to-regexp')
  return { ...actual, pathToRegexp: jest.fn(actual.pathToRegexp) }
})

describe('handleRewrites', () => {
  function handleRewrites(
    pathname: string,
    afterFiles: Rewrite[],
    {
      headers = {},
      ...options
    }: {
      headers?: IncomingMessage['headers']
      trailingSlash?: boolean
      caseSensitive?: boolean
    } = {}
  ) {
    const { handleRewrites: handle } = getServerUtils({
      page: '/[slug]',
      basePath: '',
      rewrites: { afterFiles },
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
      ...options,
    })

    return handle(
      { headers } as IncomingMessage,
      {
        pathname,
        query: {},
      } as NextUrlWithParsedQuery
    ).rewriteParams
  }

  it('should compile the source of a rewrite once', () => {
    const rewrites: Rewrite[] = [
      { source: '/compiled-once/:id', destination: '/first/:id' },
      {
        source: '/compiled-once/:id',
        destination: '/second/:id',
        has: [{ type: 'header', key: 'x-second' }],
      },
    ]

    for (const id of ['a', 'b', 'c']) {
      // A request gets its own params from the matcher that it shares with
      // the requests before it.
      expect(handleRewrites(`/compiled-once/${id}`, rewrites)).toEqual({ id })
    }

    expect(
      jest
        .mocked(pathToRegexp)
        .mock.calls.filter(([source]) => source === '/compiled-once/:id')
    ).toHaveLength(1)
  })

  it('should check the conditions of every rewrite that shares a source', () => {
    const rewrites: Rewrite[] = [
      {
        source: '/shared/:id',
        destination: '/with-header/:id',
        has: [{ type: 'header', key: 'x-variant', value: '(?<variant>a|b)' }],
      },
      {
        source: '/shared/:id',
        destination: '/without-header/:id',
        missing: [{ type: 'header', key: 'x-skip' }],
      },
    ]

    expect(
      handleRewrites('/shared/1', rewrites, { headers: { 'x-variant': 'b' } })
    ).toEqual({ id: '1', variant: 'b' })
    expect(handleRewrites('/shared/1', rewrites)).toEqual({ id: '1' })
    expect(
      handleRewrites('/shared/1', rewrites, { headers: { 'x-skip': '1' } })
    ).toEqual({})
  })

  it('should not share a matcher between case sensitivities', () => {
    const rewrites: Rewrite[] = [
      { source: '/Case/:id', destination: '/lower/:id' },
    ]

    expect(handleRewrites('/case/1', rewrites)).toEqual({ id: '1' })
    expect(
      handleRewrites('/case/1', rewrites, { caseSensitive: true })
    ).toEqual({})
    expect(
      handleRewrites('/Case/1', rewrites, { caseSensitive: true })
    ).toEqual({ id: '1' })
    expect(handleRewrites('/case/1', rewrites)).toEqual({ id: '1' })
  })

  it('should not share a matcher between trailing slash settings', () => {
    const rewrites: Rewrite[] = [
      { source: '/slash/:id/end', destination: '/slashed/:id' },
    ]

    expect(handleRewrites('/slash/1/end/', rewrites)).toEqual({})
    expect(
      handleRewrites('/slash/1/end/', rewrites, { trailingSlash: true })
    ).toEqual({ id: '1' })
    expect(handleRewrites('/slash/1/end/', rewrites)).toEqual({})
  })
})

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
