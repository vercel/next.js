import { revalidatePath, revalidateTag } from 'next/cache'
export async function POST(request) {
  const { item } = await request.json()
  if (typeof item !== 'string' || !/^[a-z-]+$/.test(item))
    return new Response(null, { status: 400 })
  revalidateTag(`state:ppr-catalog:${item}`, { expire: 0 })
  revalidatePath(`/catalog/a/${item}`)
  return Response.json({ revalidated: true })
}
