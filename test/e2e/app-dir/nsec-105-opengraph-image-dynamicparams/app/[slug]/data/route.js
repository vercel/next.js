import { getPost, publicPostParams } from '../../../posts'

export const dynamicParams = false

export function generateStaticParams() {
  return publicPostParams()
}

export async function GET(_request, { params }) {
  const { slug } = await params
  const post = getPost(slug)
  return new Response(`route:${post.status}:${post.title}`, {
    headers: { 'content-type': 'text/plain' },
  })
}
