import { revalidatePath, revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const path = searchParams.get('path')
  const tag = searchParams.get('tag')

  if (path) {
    revalidatePath(path)
  } else if (tag) {
    revalidateTag(tag, 'max')
  } else {
    return Response.json({ revalidated: false }, { status: 400 })
  }

  return Response.json({ revalidated: true })
}
