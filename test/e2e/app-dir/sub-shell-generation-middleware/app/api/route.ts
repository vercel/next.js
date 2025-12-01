import { revalidatePath } from 'next/cache'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  // Parse the path to revalidate from the request query params.
  const paths = request.nextUrl.searchParams.getAll('path')

  // Revalidate the paths.
  for (const path of paths) {
    const isPage = path.includes('[') && path.includes(']')

    revalidatePath(path, isPage ? 'page' : undefined)
  }

  return new Response('Revalidated paths')
}
