import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('test', 'never')
  return new Response(null, { status: 200 })
}
