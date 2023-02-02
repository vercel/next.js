import { normalizeAppRoute } from './app-paths'

describe('normalizeAppPath', () => {
  it.each([
    ['/(dashboard)/user/[id]/page', '/user/[id]'],
    ['/(dashboard)/account/page', '/account'],
    ['/user/[id]/page', '/user/[id]'],
    ['/account/page', '/account'],
    ['/page', '/'],
    ['/(dashboard)/user/[id]/route', '/user/[id]'],
    ['/(dashboard)/account/route', '/account'],
    ['/user/[id]/route', '/user/[id]'],
    ['/account/route', '/account'],
    ['/route', '/'],
    ['/', '/'],
  ])("can normalize '%s' to '%s'", (route, expected) => {
    const normalized = normalizeAppRoute(route)
    expect(normalized).toEqual(expected)
  })
})
