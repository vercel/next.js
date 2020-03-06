import Link from 'next/link'

export default function Nav() {
  return (
    <nav className="container mx-auto">
      <ul className="flex justify-between items-center py-8">
        <li>
          <Link href="/">
            <a className="no-underline">Home</a>
          </Link>
        </li>
        <ul className="flex justify-between items-center">
          <Link href="/blog">
            <a>Blog</a>
          </Link>
        </ul>
      </ul>
    </nav>
  )
}
