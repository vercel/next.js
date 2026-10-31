import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const { tag, state } = await request.json()
  revalidateTag(tag, state === 'stale' ? 'max' : { expire: 0 })
  return new Response(null, { status: 204 })
}
