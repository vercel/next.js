import { Suspense } from 'react'
import { cookies } from 'next/headers'
import Link from 'next/link'

async function getBlogPost(locale: string, slug: string) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 700))
  return {
    title: `Blog Post: ${slug}`,
    locale,
    content: 'This content was fetched from the CMS...',
    relatedPosts: ['Related Post 1', 'Related Post 2', 'Related Post 3'],
  }
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  return (
    <main>
      <div id="static-blog-header">Blog Article</div>
      <div id="static-reading-time">Estimated reading time: 5 minutes</div>

      <Suspense fallback={<div id="blog-loading">Loading article...</div>}>
        <BlogContent params={params} />
      </Suspense>

      <Suspense fallback={<div id="dynamic-loading">Loading comments...</div>}>
        <DynamicComments />
      </Suspense>
    </main>
  )
}

// This component depends on locale and slug, so it's in Suspense
async function BlogContent({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const post = await getBlogPost(locale, slug)
  return (
    <>
      <article id="blog-content">
        <h1>{post.title}</h1>
        <p>Locale: {post.locale}</p>
        <p>{post.content}</p>
      </article>
      <aside id="related-posts">
        <h2>Related Posts ({post.locale})</h2>
        <ul>
          {post.relatedPosts.map((title, i) => (
            <li key={i}>
              <Link href={`/en/blog/${i}`}>{title}</Link>
            </li>
          ))}
        </ul>
      </aside>
    </>
  )
}

async function DynamicComments() {
  const cookieStore = await cookies()
  const user = cookieStore.get('user')?.value || 'anonymous'
  return (
    <section id="comments">
      <h3>Comments</h3>
      <p>Viewing as: {user}</p>
    </section>
  )
}
export function generateStaticParams() {
  return [{ slug: 'hello-world' }, { slug: 'getting-started' }]
}
