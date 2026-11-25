import { revalidatePath } from 'next/cache'

export async function POST() {
  revalidatePath('/fallback-shell-revalidation/[one]/[two]', 'page')
  return Response.json({ revalidated: true })
}
