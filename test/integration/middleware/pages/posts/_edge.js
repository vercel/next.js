export function onEdgeRequest(_, res, next) {
  res.setHeaders({ 'x-bar': 'foo' })
  next()
}
