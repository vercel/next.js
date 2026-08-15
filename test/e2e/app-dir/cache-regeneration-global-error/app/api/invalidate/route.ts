import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('cached-page', { expire: 0 })

  return new Response(null, { status: 204 })
}
