export function GET(request) {
  const enabled = request.nextUrl.searchParams.get('enabled') !== 'false'
  globalThis.__nextTestRecover = enabled
  return new Response('ok')
}
