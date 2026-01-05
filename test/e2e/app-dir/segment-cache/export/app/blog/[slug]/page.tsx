import Link from 'next/link'

export function generateStaticParams() {
  return [{ slug: 'post-1' }, { slug: 'post-2' }, { slug: 'post-3' }]
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <div id="blog-post">
      <h1>Blog: {slug}</h1>
      <p>This is the content for {slug}</p>
      <Link href="/">Back to home</Link>
    </div>
  )
}
