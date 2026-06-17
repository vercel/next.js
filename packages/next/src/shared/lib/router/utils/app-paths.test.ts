import {
  compareAppPaths,
  getAppPageRouteDefinitionPage,
  normalizeRscURL,
} from './app-paths'

describe('getAppPageRouteDefinitionPage', () => {
  it('prefers an app path that directly normalizes to the route', () => {
    const appPaths = ['/@slot/[...catchAll]/page', '/foo/page'].sort(
      compareAppPaths
    )

    expect(getAppPageRouteDefinitionPage('/foo', appPaths)).toBe('/foo/page')
  })

  it('uses the first exact app path as the route entry owner', () => {
    const appPaths = ['/[...catchAll]/page', '/@slot/[...catchAll]/page'].sort(
      compareAppPaths
    )

    expect(getAppPageRouteDefinitionPage('/[...catchAll]', appPaths)).toBe(
      '/@slot/[...catchAll]/page'
    )
  })

  it('falls back to the children page', () => {
    const appPaths = ['/[...catchAll]/page', '/@slot/[...catchAll]/page'].sort(
      compareAppPaths
    )

    expect(getAppPageRouteDefinitionPage('/unrelated', appPaths)).toBe(
      '/[...catchAll]/page'
    )
  })
})

describe('normalizeRscPath', () => {
  it('should normalize url with .rsc', () => {
    expect(normalizeRscURL('/test.rsc')).toBe('/test')
  })
  it('should normalize url with .rsc and searchparams', () => {
    expect(normalizeRscURL('/test.rsc?abc=def')).toBe('/test?abc=def')
  })
})
