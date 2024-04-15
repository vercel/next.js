export async function GET(request) {
  process.env.__TEST_SENTINEL = request.nextUrl.searchParams.get('value')
  return new Response('ok')
}
