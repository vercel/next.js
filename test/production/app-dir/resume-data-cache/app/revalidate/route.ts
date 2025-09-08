import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('test')
  return new Response(null, { status: 200 })
}
