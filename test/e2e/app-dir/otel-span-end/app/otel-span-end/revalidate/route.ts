import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('otel-span-end:built', { expire: 0 })
  return new Response('revalidated')
}
