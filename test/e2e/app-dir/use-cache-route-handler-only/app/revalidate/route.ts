import { revalidatePath } from 'next/cache'

export async function POST() {
  revalidatePath('/node')

  return new Response(null, { status: 204 })
}
