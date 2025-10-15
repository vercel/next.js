import { revalidatePath } from 'next/cache'

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get('path')!
  revalidatePath(path)

  return Response.json({ revalidated: true })
}
