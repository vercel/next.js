export function GET(request) {
  const search = request.url.split('?')[1] || ''
  throw new Error(
    'server-dynamic-route-node-error' + (search ? `?${search}` : '')
  )
}
