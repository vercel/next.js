import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('test', 'seconds')
  return new Response(null, { status: 200 })
}
