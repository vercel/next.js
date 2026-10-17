import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('early-tag', { expire: 0 })
  return new Response('ok')
}
