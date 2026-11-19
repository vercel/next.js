import { revalidatePath } from 'next/cache'
export async function POST() {
  revalidatePath('/full-segment-emission/isr')
  return new Response('ok')
}
