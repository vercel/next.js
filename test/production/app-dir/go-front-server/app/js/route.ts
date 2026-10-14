export function GET(request: Request) {
  return Response.json({
    language: 'js',
    pid: process.pid,
    privateToken: request.headers.get('x-next-go-upstream-token'),
  })
}
