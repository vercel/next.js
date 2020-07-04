import Link from 'next/link'

const Nav = () => {
  return (
    <nav>
      <Link href="/">
        <a>Experiments</a>
      </Link>{' '}
      <Link href="/features">
        <a>Features</a>
      </Link>
    </nav>
  )
}

export default Nav
