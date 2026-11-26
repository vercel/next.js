import { revalidateTag } from 'next/cache'

export function POST() {
  revalidateTag('all-slugs', 'max')
  return Response.json({ revalidated: 'all-slugs' })
}
