import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  ;(await draftMode()).enable()
  const destination = new URL(request.url).searchParams.get('to') ?? '/'
  redirect(destination)
}
