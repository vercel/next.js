import { parse } from 'url'
import pathMatch from 'path-match'

const route = pathMatch()

export default class Router {
  constructor () {
    this.routes = new Map()
  }

  get (path, fn) {
    this.add('GET', path, fn)
  }

  add (method, path, fn) {
    const routes = this.routes.get(method) || new Set()
    routes.add({ match: route(path), fn })
    this.routes.set(method, routes)
  }

  match (req, res) {
    const routes = this.routes.get(req.method)
    if (!routes) return

    const { pathname } = parse(req.url)
    for (const r of routes) {
      const params = r.match(pathname)
      if (params) {
        return async () => {
          return r.fn(req, res, params)
        }
      }
    }
  }
}
