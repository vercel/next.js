// route handler with secret and slug
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

// Preview URL: localhost:3000/api/draft?secret=secret-token&slug=preview-page

export async function GET(request: Request) {
  // Parse query string parameters
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug')

  // Check the secret and next parameters
  if (secret !== 'secret-token' || !slug) {
    return new Response('Invalid token', { status: 401 })
  }

  // Enable Draft Mode by setting the cookie
  ;(await draftMode()).enable()

  // Redirect to the path
  redirect(`/${slug}`)
}
