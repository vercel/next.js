import { revalidateTag } from 'next/cache'

export const POST = async () => {
  revalidateTag('unstable-cache-fetch')
  return new Response('OK', { status: 200 })
}
