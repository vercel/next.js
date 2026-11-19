import { revalidatePath } from 'next/cache'

export async function POST() {
  revalidatePath('/router-state-header-ppr')
  return Response.json({ revalidated: true })
}
