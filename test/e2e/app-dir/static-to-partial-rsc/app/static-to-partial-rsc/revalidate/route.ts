import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  const pathname = new URL(request.url).searchParams.get('path')
  if (!pathname?.startsWith('/static-to-partial-rsc/')) {
    return new Response('Invalid path', { status: 400 })
  }

  revalidatePath(pathname)
  return Response.json({ revalidated: true })
}
