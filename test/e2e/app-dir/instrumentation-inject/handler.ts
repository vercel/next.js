export function GET(request: Request) {
  if (new URL(request.url).searchParams.has('error')) {
    throw new Error('injected request failure')
  }
  return Response.json({
    runtime: process.env.NEXT_RUNTIME,
    order: process.env.INJECT_ORDER,
  })
}
