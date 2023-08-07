import Link from 'next/link'

export default function Blog({ params }) {
  return (
    <div id="blog-post-page">
      <h1>Blog post {params.slug}</h1>
      <Link href="/" style={{ display: 'block' }}>
        Go home
      </Link>
    </div>
  )
}
