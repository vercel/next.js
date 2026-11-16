export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export default async function BlogPost({ params }) {
  const { slug } = await params
  return <p>blog post {slug}</p>
}
