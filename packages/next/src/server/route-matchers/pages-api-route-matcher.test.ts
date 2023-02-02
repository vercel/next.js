import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import { RouteType } from '../route-matches/route-match'
import { PagesAPIRouteMatcher } from './pages-api-route-matcher'

describe('PagesAPIRouteMatcher', () => {
  it('returns no routes with an empty manifest', () => {
    const matcher = new PagesAPIRouteMatcher('<root>', {})
    expect(matcher.routes()).toEqual([])
  })

  it('returns the correct routes', () => {
    const matcher = new PagesAPIRouteMatcher('<root>', {
      '/api/users/[id]': 'pages/api/users/[id].js',
      '/api/users': 'pages/api/users.js',
      '/users/[id]': 'pages/users/[id].js',
      '/users': 'pages/users.js',
    })
    const routes = matcher.routes()

    expect(routes).toHaveLength(2)
    expect(routes).toContainEqual({
      type: RouteType.PAGES_API,
      pathname: '/api/users/[id]',
      filename: `<root>/${SERVER_DIRECTORY}/pages/api/users/[id].js`,
    })
    expect(routes).toContainEqual({
      type: RouteType.PAGES_API,
      pathname: '/api/users',
      filename: `<root>/${SERVER_DIRECTORY}/pages/api/users.js`,
    })
  })
})
