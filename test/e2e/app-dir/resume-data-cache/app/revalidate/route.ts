import { revalidateTag } from 'next/cache'
import { getCacheTag } from '../../utils'

export function POST(req: Request) {
  const tag = new URL(req.url).searchParams.get('tag')
  if (!tag) {
    return new Response('Expected "tag" search param to be set', {
      status: 400,
    })
  }

  revalidateTag(getCacheTag(tag), 'minutes')
  return new Response(null, { status: 200 })
}
