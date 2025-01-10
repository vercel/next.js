import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(req: Request) {
  ;(await draftMode()).enable()
  const to = new URL(req.url).searchParams.get('to') ?? '/some-other-page'
  return redirect(to)
}
