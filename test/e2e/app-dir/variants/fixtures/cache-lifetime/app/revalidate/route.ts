import { revalidateTag } from 'next/cache'

// Expires whichever tag it is given, so the next request for anything carrying
// that tag has to revalidate. `expire: 0` makes it immediate, which is what
// lets a test exercise a revalidating render without waiting out a cache
// lifetime. Taking the tag from the caller is what lets one test expire its own
// entries without disturbing the ones another test reads.
export async function GET(request: Request) {
  const tag = new URL(request.url).searchParams.get('tag')

  if (!tag) {
    return new Response('missing tag', { status: 400 })
  }

  revalidateTag(tag, { expire: 0 })

  return new Response('ok')
}
