import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const { tenant } = await request.json()
  if (typeof tenant !== 'string') {
    return new Response(null, { status: 400 })
  }
  revalidateTag('segment-cache-metadata:tenant:' + tenant, 'max')
  return new Response(null, { status: 204 })
}
