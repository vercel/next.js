import { revalidateTag } from 'next/cache'

export const POST = async () => {
  revalidateTag('unstable-cache-fetch', 'expireNow')
  return new Response('OK', { status: 200 })
}
