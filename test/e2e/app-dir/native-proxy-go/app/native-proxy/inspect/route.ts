async function handler(request: Request) {
  return Response.json({
    method: request.method,
    query: new URL(request.url).search,
    body: await request.text(),
    fromGo: request.headers.get('x-from-go'),
    removed: request.headers.get('x-client-remove'),
    cookie: request.headers.get('cookie'),
    date: request.headers.get('date'),
    host: request.headers.get('host'),
    flight: {
      rsc: request.headers.get('rsc'),
      routerStateTree: request.headers.get('next-router-state-tree'),
      prefetch: request.headers.get('next-router-prefetch'),
      hmrRefresh: request.headers.get('next-hmr-refresh'),
      segmentPrefetch: request.headers.get('next-router-segment-prefetch'),
    },
  })
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
}
