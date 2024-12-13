import { after } from 'next/server'

export async function middleware(
  /** @type {import ('next/server').NextRequest} */ request
) {
  const url = new URL(request.url)

  {
    const match = url.pathname.match(
      /^(?<prefix>\/[^/]+?)\/middleware\/redirect-source/
    )
    if (match) {
      after(async () => {})
    }
  }
}

export const config = {
  matcher: ['/:prefix/middleware/:path*'],
}
