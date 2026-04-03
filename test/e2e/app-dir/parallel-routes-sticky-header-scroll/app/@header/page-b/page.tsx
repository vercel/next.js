import Link from 'next/link'

export default function HeaderPageB() {
  return (
    <nav>
      <span id="header-page-b">Header: Page B</span>
      {' | '}
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
