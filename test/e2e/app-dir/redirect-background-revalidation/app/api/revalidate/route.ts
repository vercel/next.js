import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('redirects', 'max')
  return Response.json({ revalidated: true })
}
