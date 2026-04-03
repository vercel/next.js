import Link from 'next/link'

export default function DefaultHeader() {
  return (
    <nav>
      <Link href="/page-a" id="header-link-a">
        Go to Page A
      </Link>
      {' | '}
      <Link href="/page-b" id="header-link-b">
        Go to Page B
      </Link>
    </nav>
  )
}
