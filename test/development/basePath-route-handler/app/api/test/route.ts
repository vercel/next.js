export async function GET(request: Request) {
  return new Response(request.url)
}
