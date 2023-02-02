import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import { RouteType } from '../route-matches/route-match'
import { PagesRouteMatcher } from './pages-route-matcher'

describe('PagesRouteMatcher', () => {
  it('returns no routes with an empty manifest', () => {
    const matcher = new PagesRouteMatcher('<root>', {})
    expect(matcher.routes()).toEqual([])
  })

  it('returns the correct routes', () => {
    const matcher = new PagesRouteMatcher('<root>', {
      '/api/users/[id]': 'pages/api/users/[id].js',
      '/api/users': 'pages/api/users.js',
      '/users/[id]': 'pages/users/[id].js',
      '/users': 'pages/users.js',
    })
    const routes = matcher.routes()

    expect(routes).toHaveLength(2)
    expect(routes).toContainEqual({
      type: RouteType.PAGES,
      pathname: '/users/[id]',
      filename: `<root>/${SERVER_DIRECTORY}/pages/users/[id].js`,
    })
    expect(routes).toContainEqual({
      type: RouteType.PAGES,
      pathname: '/users',
      filename: `<root>/${SERVER_DIRECTORY}/pages/users.js`,
    })
  })
})
