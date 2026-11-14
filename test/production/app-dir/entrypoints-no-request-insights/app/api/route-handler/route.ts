export async function GET(request: Request) {
  // The patched `fetch` reports to Request Insights in development.
  const response = await fetch(new URL('/api/data', request.url))
  return Response.json({ entry: 'route handler', data: await response.json() })
}
