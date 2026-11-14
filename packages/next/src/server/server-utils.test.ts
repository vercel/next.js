import { parseUrl } from '../shared/lib/router/utils/parse-url'
import { getServerUtils } from './server-utils'

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

describe('handleRewrites', () => {
  it('does not mutate the original URL or query', () => {
    const { handleRewrites } = getServerUtils({
      page: '/destination',
      basePath: '',
      rewrites: {
        beforeFiles: [
          {
            source: '/source',
            destination: '/destination?added=value&shared=updated',
          },
        ],
      },
      i18n: undefined,
      pageIsDynamic: false,
      caseSensitive: false,
    })
    const parsedUrl = parseUrl('/source?keep=yes&shared=one&shared=two')
    const shared = parsedUrl.query.shared
    const originalUrl = structuredClone(parsedUrl)

    const { rewrittenParsedUrl } = handleRewrites(
      {} as Parameters<typeof handleRewrites>[0],
      parsedUrl
    )

    expect(parsedUrl).toEqual(originalUrl)
    expect(parsedUrl.query.shared).toBe(shared)
    expect(rewrittenParsedUrl).toMatchObject({
      pathname: '/destination',
      query: { keep: 'yes', shared: 'updated', added: 'value' },
    })
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
