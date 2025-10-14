import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('test', 'expireNow')
  return new Response(null, { status: 200 })
}
