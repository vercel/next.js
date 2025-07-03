export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const params = await props.params

  return (
    <div>
      <h2>Blog Post: {params.slug}</h2>
      <p>This is a blog post about {params.slug}.</p>
    </div>
  )
}
