export async function QUERY(request: Request) {
  return Response.json({
    method: request.method,
    contentType: request.headers.get('content-type'),
    body: await request.json(),
  })
}
