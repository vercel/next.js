import { notFound } from 'next/navigation'
import { getPost, publicPostParams } from '../../posts'

export function generateStaticParams() {
  return publicPostParams()
}

export default async function PostPage({ params }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post || post.status !== 'public') {
    notFound()
  }
  return (
    <main>
      <p>{`page:${post.status}:${post.title}`}</p>
    </main>
  )
}
