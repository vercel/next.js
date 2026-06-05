// ⛔ MESSY, three problems at once:
//  1. No generateStaticParams → [slug] is a fallback route, params deferred for
//     the whole subtree. The slug set IS enumerable (getAllPostSlugs).
//     (Fix: lever 4 — add generateStaticParams so `await params` is build-known.)
//  2. Top-level `await params` + `await getPost` block the frame.
//     getPost is shared/stable → cache it. (Fix: lever 3 + keep title in shell.)
//  3. Comments are also awaited at the top, with no boundary. They can stream.
//     (Fix: lever 1 — push <Comments> into its own <Suspense> with a real
//     skeleton; the post title/body stay in the shell.)
import { getPost, getComments } from '@/lib/data'

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  const comments = await getComments(slug)

  if (!post) return <p>Not found</p>

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
      <h2>Comments</h2>
      <ul>
        {comments.map((c) => (
          <li key={c.id}>{c.text}</li>
        ))}
      </ul>
    </article>
  )
}
