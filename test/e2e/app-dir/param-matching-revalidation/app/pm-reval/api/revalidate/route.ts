import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const { tag, path, type } = await request.json()
  if (tag) {
    revalidateTag(tag, 'max')
  } else {
    revalidatePath(path, type)
  }
  return Response.json({ revalidated: true })
}
