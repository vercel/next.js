import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import { RouteType } from '../route-matches/route-match'
import { AppPageRouteMatcher } from './app-page-route-matcher'

describe('AppPageRouteMatcher', () => {
  it('returns no routes with an empty manifest', () => {
    const matcher = new AppPageRouteMatcher('<root>', {})
    expect(matcher.routes()).toEqual([])
  })

  it('returns the correct routes', () => {
    const matcher = new AppPageRouteMatcher('<root>', {
      '/dashboard/users/[id]/page': 'app/dashboard/users/[id]/page.js',
      '/dashboard/users/page': 'app/dashboard/users/page.js',
      '/users/[id]/route': 'app/users/[id]/route.js',
      '/users/route': 'app/users/route.js',
    })
    const routes = matcher.routes()

    expect(routes).toHaveLength(2)
    expect(routes).toContainEqual({
      type: RouteType.APP_PAGE,
      pathname: '/dashboard/users',
      filename: `<root>/${SERVER_DIRECTORY}/app/dashboard/users/page.js`,
    })
    expect(routes).toContainEqual({
      type: RouteType.APP_PAGE,
      pathname: '/dashboard/users/[id]',
      filename: `<root>/${SERVER_DIRECTORY}/app/dashboard/users/[id]/page.js`,
    })
  })
})
