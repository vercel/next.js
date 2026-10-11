import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('root-fallback-shell', { expire: 0 })
  return new Response(null, { status: 204 })
}
