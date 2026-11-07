export async function GET(request: Request) {
  return Response.json({
    route: 'app dynamic route handler',
    probe: request.headers.get('x-probe'),
  })
}
