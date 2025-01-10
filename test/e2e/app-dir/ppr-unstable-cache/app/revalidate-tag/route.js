import { unstable_expireTag } from 'next/cache'

export const POST = async () => {
  unstable_expireTag('unstable-cache-fetch')
  return new Response('OK', { status: 200 })
}
