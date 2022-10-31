import Link from 'next/link'
import Image from 'next/image'

export default function Blog() {
  return (
    <div>
      <h3>This is our blog</h3>
      <ul>
        <li>
          <Link href="/post/1">Post 1</Link>
        </li>
        <li>
          <Link href="/post/2">Post 2</Link>
        </li>
      </ul>
      <a href="/">Home</a>
      <div>
        <Image
          src="/blog/static/nextjs.png"
          alt="Next.js logo"
          width={200}
          height={160}
        />
      </div>
    </div>
  )
}
