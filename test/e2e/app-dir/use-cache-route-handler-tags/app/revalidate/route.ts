import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('route-handler-tag', { expire: 0 })

  return new Response(null, { status: 204 })
}
