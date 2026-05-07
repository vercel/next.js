import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  const tag = searchParams.get('tag')

  if (path) {
    revalidatePath(path)
  }
  if (tag) {
    revalidateTag(tag, 'max')
  }

  return Response.json({ ok: true, path, tag })
}
