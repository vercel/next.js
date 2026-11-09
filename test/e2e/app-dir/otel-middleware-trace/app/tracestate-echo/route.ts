export async function GET(request: Request) {
  // The `tracestate` of a request the middleware or a render made (see
  // `/outgoing`), so the test can check what it carries.
  return Response.json({ tracestate: request.headers.get('tracestate') })
}
