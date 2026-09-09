import { getAllSlugs, posts } from '../../../lib/posts'

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = posts[slug]
  return (
    <main>
      <h1>{post.title}</h1>
      <p>{post.excerpt}</p>
    </main>
  )
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}
