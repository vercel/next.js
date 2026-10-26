import { revalidateTag } from 'next/cache'

export async function POST(request) {
  const tag = new URL(request.url).searchParams.get('tag')
  revalidateTag(tag, 'max')

  return Response.json({ ok: true, tag })
}
