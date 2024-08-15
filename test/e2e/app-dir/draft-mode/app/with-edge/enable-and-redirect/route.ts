import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export function GET(req: Request) {
  draftMode().enable()
  const to = new URL(req.url).searchParams.get('to') ?? '/some-other-page'
  return redirect(to)
}
