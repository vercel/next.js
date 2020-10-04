import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/[post]?post=post-1" as="/blog/post-1">
      <a id="click-me">Click me</a>
    </Link>
  )
}
