export default class RouterState {
  constructor (pathname, query, as) {
    // represents the current component key
    this.route = toRoute(pathname)
    this.pathname = pathname
    this.query = query
    this.asPath = as
  }
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}
