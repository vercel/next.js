import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  const { pathname } = await request.json()
  revalidatePath(pathname)
  return Response.json({ revalidated: true })
}
