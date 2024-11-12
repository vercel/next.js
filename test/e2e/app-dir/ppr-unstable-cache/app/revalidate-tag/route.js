import { expireTag } from 'next/cache'

export const POST = async () => {
  expireTag('unstable-cache-fetch')
  return new Response('OK', { status: 200 })
}
