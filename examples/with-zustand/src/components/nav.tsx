import Link from 'next/link'
import { CSSProperties } from 'react'

const LinkStyle: CSSProperties = { marginRight: '25px' }

const Nav = () => {
  return (
    <nav>
      <Link href="/ssg" style={LinkStyle}>
        SSG
      </Link>
      <Link href="/" style={LinkStyle}>
        SSR
      </Link>
    </nav>
  )
}

export default Nav
