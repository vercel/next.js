import { revalidatePath } from 'next/cache'

export async function POST() {
  revalidatePath('/products/known')
  return Response.json({ revalidated: true })
}
