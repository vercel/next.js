import Link from 'next/link'

const Header = () => (
  <header>
    <ul>
      <li>
        <Link href="/">
          <a>Home</a>
        </Link>
      </li>
      <li>
        <Link href="/about">
          <a>About</a>
        </Link>
      </li>
      <li>
        <Link href="/$post" as="/first-post">
          <a>First Post</a>
        </Link>
      </li>
      <li>
        <Link href="/$post" as="/second-post">
          <a>Second Post</a>
        </Link>
      </li>
    </ul>
  </header>
)

export default Header
