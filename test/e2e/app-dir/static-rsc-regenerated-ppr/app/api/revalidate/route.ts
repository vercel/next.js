import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const tag = new URL(request.url).searchParams.get('tag')!
  revalidateTag(tag, { expire: 0 })
  return Response.json({ revalidated: tag })
}
