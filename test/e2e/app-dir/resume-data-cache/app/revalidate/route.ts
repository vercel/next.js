import { revalidateTag } from 'next/cache'

export function POST(req: Request) {
  const tag = new URL(req.url).searchParams.get('tag')
  if (!tag) {
    return new Response('Expected "tag" search param to be set', {
      status: 400,
    })
  }

  revalidateTag(tag, 'minutes')
  return new Response(null, { status: 200 })
}
