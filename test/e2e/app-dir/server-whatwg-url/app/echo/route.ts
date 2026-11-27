export function GET(request: Request) {
  const url = new URL(request.url)
  return Response.json({
    pathname: url.pathname,
    entries: [...url.searchParams],
  })
}
