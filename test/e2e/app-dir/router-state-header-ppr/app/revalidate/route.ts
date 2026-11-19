import { revalidatePath } from 'next/cache'

export async function POST() {
  revalidatePath('/')
  return Response.json({ revalidated: true })
}
