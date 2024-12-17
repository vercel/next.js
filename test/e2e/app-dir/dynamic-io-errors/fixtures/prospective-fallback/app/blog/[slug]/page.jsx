export default async function BlogPage({ params }) {
  const { slug } = await params
  return <div>Blog: {slug}</div>
}
