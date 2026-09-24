import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2 id="blog-not-found">Not Found</h2>
      <Link id="back-to-blog" href="/blog">
        Return to Blog
      </Link>
    </div>
  )
}
