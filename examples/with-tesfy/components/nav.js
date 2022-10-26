import Link from 'next/link'

const Nav = () => {
  return (
    <nav>
      <Link href="/">Experiments</Link> <Link href="/features">Features</Link>
    </nav>
  )
}

export default Nav
