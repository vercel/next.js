import { revalidatePath } from 'next/cache'
export async function POST(request) {
  const { pathname } = await request.json()
  if (typeof pathname !== 'string' || !pathname.startsWith('/app-victim/'))
    return new Response(null, { status: 400 })
  revalidatePath(pathname)
  return Response.json({ revalidated: true })
}
