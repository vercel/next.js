import type { NextRequest } from 'next/server'

// We use this in combination with fallback rewrites to redirect all /:teamSlug URLs to /app-future/[locale]/:teamSlug
// in order to avoid having to grab all existing pages at build and checking the path in middleware
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: {
      path: string
    }
  }
): Promise<Response> {
  console.log('TEST HIT', request.url)
  request.nextUrl.pathname = `/app-future/en/${params.path}`
  return fetch(request.nextUrl, {
    headers: new Headers({
      cookie: request.headers.get('cookie') ?? '',
    }),
  })
}
