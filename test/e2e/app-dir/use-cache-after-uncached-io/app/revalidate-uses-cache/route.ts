import { revalidatePath, revalidateTag } from 'next/cache'

/** Evicts the entry so the prefetch's fill actually runs. */
export async function POST() {
  revalidateTag('use-cache-after-uncached-io:data', { expire: 0 })
  revalidatePath('/uses-cache')

  return Response.json({ ok: true })
}
