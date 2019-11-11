import Link from 'next/link'

export const Nav = () => (
  <ul>
    <li>
      <Link href="/">
        <a>Index</a>
      </Link>
    </li>
    <li>
      <Link href="/about">
        <a>About</a>
      </Link>
    </li>
  </ul>
)
