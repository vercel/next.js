async function handler(request: Request) {
  return Response.json({
    method: request.method,
    query: new URL(request.url).search,
    body: await request.text(),
    fromGo: request.headers.get('x-from-go'),
    removed: request.headers.get('x-client-remove'),
    cookie: request.headers.get('cookie'),
  })
}

export { handler as GET, handler as POST }
