import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = new URL(request.url)

  // Test case: rewrite with query param value containing &
  if (url.pathname === '/api/image-proxy') {
    const imageUrl = url.searchParams.get('url')

    if (!imageUrl) {
      return NextResponse.next()
    }

    // Check if secret is already present (indicates internal rewrite)
    const parsedImageUrl = new URL(imageUrl)

    if (parsedImageUrl.searchParams.has('secret')) {
      // This is the internal rewrite - let it through
      return NextResponse.next()
    }

    // Add secret to the image URL
    parsedImageUrl.searchParams.set('secret', 'super-secret')

    // Set the modified URL back as the url param
    url.searchParams.set('url', parsedImageUrl.toString())

    // This should preserve the & in the URL parameter value
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}
