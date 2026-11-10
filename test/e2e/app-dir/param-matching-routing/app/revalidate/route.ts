import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  const { pathname, type } = await request.json()
  revalidatePath(pathname, type)
  return Response.json({ revalidated: true })
}
