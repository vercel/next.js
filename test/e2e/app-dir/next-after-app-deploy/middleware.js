import { after } from 'next/server'

export function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  const url = new URL(request.url)

  const match = url.pathname.match(/^(?<prefix>\/[^/]+?)\/middleware/)
  if (match) {
    const pathPrefix = match.groups.prefix
    after(async () => {
      // we can't call revalidatePath from middleware, so we need to do it via an endpoint instead
      const pathToRevalidate = pathPrefix + `/middleware`

      const postUrl = new URL('/timestamp/trigger-revalidate', url.href)
      postUrl.searchParams.append('path', pathToRevalidate)

      const response = await fetch(postUrl, { method: 'POST' })
      if (!response.ok) {
        throw new Error(
          `Failed to revalidate path '${pathToRevalidate}' (status: ${response.status})`
        )
      }
    })
  }
}

export const config = {
  matcher: ['/:prefix/middleware'],
}
