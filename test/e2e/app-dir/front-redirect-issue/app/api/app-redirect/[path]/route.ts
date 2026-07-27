import type { NextRequest } from 'next/server'

// We use this in combination with fallback rewrites to redirect all /:teamSlug URLs to /app-future/[locale]/:teamSlug
// in order to avoid having to grab all existing pages at build and checking the path in middleware
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      path: string
    }>
  }
): Promise<Response> {
  request.nextUrl.pathname = `/app-future/en/${(await params).path}`
  return fetch(request.nextUrl, {
    headers: new Headers({
      cookie: request.headers.get('cookie') ?? '',
    }),
  }).then(async (res) => {
    const resHeaders = new Headers(res.headers)
    resHeaders.delete('content-encoding')
    return new Response(res.body, { status: res.status, headers: resHeaders })
  })
}
