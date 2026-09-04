import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  revalidatePath('/')
  return Response.json({ revalidated: true })
}
