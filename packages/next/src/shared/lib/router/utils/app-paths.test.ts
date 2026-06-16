import {
  compareAppPaths,
  getAppPageRouteDefinitionPage,
  normalizeRscURL,
} from './app-paths'

describe('getAppPageRouteDefinitionPage', () => {
  it('uses the first sorted app path as the route entry owner', () => {
    const appPaths = ['/(group)/page', '/@slot/(group)/page'].sort(
      compareAppPaths
    )

    expect(appPaths).toEqual(['/@slot/(group)/page', '/(group)/page'])
    expect(getAppPageRouteDefinitionPage(appPaths)).toBe('/@slot/(group)/page')
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
