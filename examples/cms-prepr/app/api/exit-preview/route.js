import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET() {
  // Exit Draft Mode by removing the cookie.
  const draft = await draftMode()
  draft.disable()

  // Redirect the user back to the index page.
  redirect('/')
}
