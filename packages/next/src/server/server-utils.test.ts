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

describe('interpolateDynamicPath', () => {
  it('should interpolate catch-all string params preserving slash delimiters', () => {
    const { interpolateDynamicPath } = getServerUtils({
      page: '/[...slug]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = interpolateDynamicPath('/[...slug]', {
      slug: 'a/b/c',
    })
    expect(result).toEqual('/a/b/c')
  })

  it('should interpolate catch-all array params', () => {
    const { interpolateDynamicPath } = getServerUtils({
      page: '/[...slug]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = interpolateDynamicPath('/[...slug]', {
      slug: ['a', 'b', 'c'],
    })
    expect(result).toEqual('/a/b/c')
  })

  it('should split unsplit elements in catch-all array params', () => {
    const { interpolateDynamicPath } = getServerUtils({
      page: '/[...slug]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = interpolateDynamicPath('/[...slug]', {
      slug: ['a/b', 'c'],
    })
    expect(result).toEqual('/a/b/c')
  })

  it('should encode special characters per segment in catch-all routes', () => {
    const { interpolateDynamicPath } = getServerUtils({
      page: '/[...slug]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = interpolateDynamicPath('/[...slug]', {
      slug: 'a b/c',
    })
    expect(result).toEqual('/a%20b/c')
  })

  it('should interpolate optional catch-all params with string values', () => {
    const { interpolateDynamicPath } = getServerUtils({
      page: '/docs/[[...slug]]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = interpolateDynamicPath('/docs/[[...slug]]', {
      slug: 'getting-started/installation',
    })
    expect(result).toEqual('/docs/getting-started/installation')
  })

  it('should encode slash in single dynamic param route', () => {
    const { interpolateDynamicPath } = getServerUtils({
      page: '/posts/[id]',
      basePath: '',
      rewrites: {},
      i18n: undefined,
      pageIsDynamic: true,
      caseSensitive: false,
    })

    const result = interpolateDynamicPath('/posts/[id]', {
      id: 'hello/world',
    })
    expect(result).toEqual('/posts/hello%2Fworld')
  })
})

