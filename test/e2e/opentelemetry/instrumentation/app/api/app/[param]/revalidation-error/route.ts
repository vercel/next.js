import { revalidateTag } from 'next/cache'

export function GET() {
  revalidateTag('reject-after-headers', 'max')
  return new Response('committed')
}

export const dynamic = 'force-dynamic'
