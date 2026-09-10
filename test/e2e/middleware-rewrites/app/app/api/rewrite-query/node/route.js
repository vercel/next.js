export function GET(request) {
  return Response.json(Object.fromEntries(request.nextUrl.searchParams))
}
