import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPreviewPostBySlug, toRouteSlug } from '@/lib/api'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug')

  // Check the secret and slug parameters.
  // This secret should only be known to this route and the CMS.
  if (secret !== process.env.PREPRIO_PREVIEW_SECRET || !slug) {
    return new Response('Invalid token', { status: 401 })
  }

  // Fetch the headless CMS to check if the provided `slug` exists.
  const post = await getPreviewPostBySlug(slug)

  // If the slug doesn't exist prevent draft mode from being enabled.
  if (!post) {
    return new Response('Invalid slug', { status: 401 })
  }

  // Enable Draft Mode by setting the cookie.
  const draft = await draftMode()
  draft.enable()

  // Redirect to the path from the fetched post.
  // We don't redirect to the raw slug as that might lead to open redirect
  // vulnerabilities.
  redirect(`/posts/${toRouteSlug(post._slug)}`)
}
