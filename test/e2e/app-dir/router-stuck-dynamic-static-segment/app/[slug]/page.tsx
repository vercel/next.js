import Link from 'next/link'

export default async function Page(props) {
  const params = await props.params
  return (
    <div>
      <h1 id="slug-page">Visiting page {params.slug}</h1>
      <Link href="/blog/a-post" style={{ display: 'block' }} id="to-blog-post">
        Go to a post
      </Link>
      <Link href="/" style={{ display: 'block' }}>
        Go home
      </Link>
    </div>
  )
}
