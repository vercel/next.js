export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params

  return (
    <div>
      <h1 id="blog-page">App Router Blog Post</h1>
      <p id="blog-locale">{lang}</p>
      <p id="blog-slug">{slug}</p>
    </div>
  )
}
