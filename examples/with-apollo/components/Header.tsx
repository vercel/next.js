import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Header: React.FC = () => {
  const { pathname } = useRouter()
  const activeRoute = (path: string) =>
    pathname === path ? 'is-active' : undefined

  return (
    <header>
      <Link href="/" legacyBehavior>
        <a className={activeRoute('/')}>Home</a>
      </Link>
      <Link href="/about" legacyBehavior>
        <a className={activeRoute('/about')}>About</a>
      </Link>
      <Link href="/client-only" legacyBehavior>
        <a className={activeRoute('/client-only')}>Client-Only</a>
      </Link>
      <Link href="/ssr" legacyBehavior>
        <a className={activeRoute('/ssr')}>SSR</a>
      </Link>
      <style jsx>{`
        header {
          margin-bottom: 25px;
        }
        a {
          font-size: 14px;
          margin-right: 15px;
          text-decoration: none;
        }
        .is-active {
          text-decoration: underline;
        }
      `}</style>
    </header>
  )
}

export default Header
