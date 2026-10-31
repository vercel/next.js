import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('cache-consumer-foreground-revalidate-inner', 'max')

  return new Response(null, { status: 204 })
}
