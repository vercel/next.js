import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function GET() {
  revalidateTag('api', 'expireNow')
  redirect('/api')
}
