import { getPost, publicPostParams } from '../../posts'

export const dynamicParams = false

export function generateStaticParams() {
  return publicPostParams()
}

export default async function OpengraphImage({ params }) {
  const { slug } = await params
  const post = getPost(slug)

  return new Response(
    `og:${post.status}:${post.title}:${post.internalSummary}`,
    {
      headers: { 'content-type': 'text/plain' },
    }
  )
}
