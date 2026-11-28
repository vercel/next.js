import { revalidateTag } from 'next/cache'

export async function POST(request) {
  const { expire } = await request.json()
  revalidateTag('window', { expire })
  return Response.json({ revalidated: true })
}
