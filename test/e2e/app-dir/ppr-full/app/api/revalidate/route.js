import { unstable_expirePath } from 'next/cache'

export async function GET(request) {
  const url = new URL(request.url)
  const pathnames = url.searchParams.getAll('pathname')
  if (pathnames.length === 0) {
    return new Response(null, { status: 400 })
  }
  for (const pathname of pathnames) {
    let type
    if (pathname.includes('[') && pathname.includes(']')) {
      type = 'page'
    }

    unstable_expirePath(pathname, type)
  }

  return new Response(
    JSON.stringify({
      revalidated: pathnames,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
