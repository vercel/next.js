export function generateStaticParams() {
  return [
    { slug: ['post-1'] },
    { slug: ['post-2'] },
    { slug: ['category', 'post-3'] },
  ]
}

export default async function Page({ params }) {
  const { slug } = await params
  const slugPath = slug.join('/')
  
  return (
    <div>
      <h1>Blog Post: {slugPath}</h1>
      <p>This is a catch-all route with slug: {slugPath}</p>
    </div>
  )
}
