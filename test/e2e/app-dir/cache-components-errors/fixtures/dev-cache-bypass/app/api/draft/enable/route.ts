import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const redirectTo = new URL(request.url).searchParams.get('redirect') ?? '/'

  ;(await draftMode()).enable()
  redirect(redirectTo)
}
