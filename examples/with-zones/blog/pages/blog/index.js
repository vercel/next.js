import Link from 'next/link'

export default function Blog() {
  return (
    <div>
      <h3>This is our blog</h3>
      <ul>
        <li>
          <Link href="/blog/post/1">
            <a>Post 1</a>
          </Link>
        </li>
        <li>
          <Link href="/blog/post/2">
            <a>Post 2</a>
          </Link>
        </li>
      </ul>
      <a href="/">Home</a>
      <div>
        <img width={200} src="/blog/static/nextjs.png" />
      </div>
    </div>
  )
}
