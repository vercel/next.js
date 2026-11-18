import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('fallback-hydration:generation', { expire: 0 })
  revalidatePath('/fallback-hydration/isr')
  return Response.json({ revalidated: true })
}
