import { revalidatePath } from 'next/cache'

const paths = new Set([
  '/revalidation-sync-io/sync-io',
  '/revalidation-sync-io/pending-iterable',
])

export async function POST(request: Request) {
  const { pathname } = await request.json()
  if (!paths.has(pathname)) {
    return new Response('Unknown path', { status: 400 })
  }

  revalidatePath(pathname)

  return Response.json({ revalidated: true })
}
