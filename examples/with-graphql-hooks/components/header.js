import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Header() {
  const { pathname } = useRouter()

  return (
    <header>
      <Link href="/" legacyBehavior>
        <a className={pathname === '/' ? 'is-active' : ''}>Home</a>
      </Link>
      <Link href="/about" legacyBehavior>
        <a className={pathname === '/about' ? 'is-active' : ''}>About</a>
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
