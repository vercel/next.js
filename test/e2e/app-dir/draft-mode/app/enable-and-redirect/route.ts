import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export function GET() {
  draftMode().enable()
  return redirect('/some-other-page')
}
