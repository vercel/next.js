import Link from 'next/link'

// This is a static sibling to /blog/[slug]. Route prediction should NOT
// apply to this route - it should be resolved via a tree prefetch, not
// by matching the dynamic [slug] pattern.
export default function FeaturedPage() {
  return (
    <div id="featured-page">
      <h1 id="featured-title">Featured Blog Post</h1>
      <p id="featured-description">
        This is a static route that exists alongside the dynamic /blog/[slug]
        route.
      </p>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
