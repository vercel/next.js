import { revalidatePath } from 'next/cache'

export async function POST() {
  revalidatePath('/sync-io')

  return Response.json({ revalidated: true })
}
