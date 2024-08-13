import { revalidatePath } from 'next/cache'

// Call /revalidate-path?path=<path> to revalidate a path
export async function GET(request) {
  const path = request.nextUrl.searchParams.get('path')

  if (path) {
    console.log(`revalidatePath(${path})`)
    revalidatePath(path)
  }

  return Response.json({
    revalidated: !!path,
    now: Date.now(),
    message: path ? 'Succeed' : 'Missing path to revalidate',
  })
}
