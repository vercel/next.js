import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('test', 'minutes')
  return new Response(null, { status: 200 })
}
