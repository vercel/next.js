import { connection } from 'next/server'
import Link from 'next/link'

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Make this component dynamic
  await connection()

  return (
    <div id="blog-post">
      <h1 id="post-title">Blog Post: {slug}</h1>
      <p id="post-slug">Slug: {slug}</p>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
