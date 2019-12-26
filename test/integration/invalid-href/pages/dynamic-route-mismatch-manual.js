import Link from 'next/link'

export default () => (
  <Link href="/[post]?post=post-1" as="/blog/post-1">
    <a>Click me</a>
  </Link>
)
