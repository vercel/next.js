import pathMatch from './lib/path-match'

export const route = pathMatch()

export default class Router {
  constructor (routes = []) {
    this.routes = routes
  }

  add (route) {
    this.routes.unshift(route)
  }

  match (req, res, parsedUrl) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return
    }

    const { pathname } = parsedUrl
    for (const route of this.routes) {
      const params = route.match(pathname)
      if (params) {
        return () => route.fn(req, res, params, parsedUrl)
      }
    }
  }
}
