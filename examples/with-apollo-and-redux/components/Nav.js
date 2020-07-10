import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Nav() {
  const { pathname } = useRouter()

  return (
    <header>
      <Link href="/">
        <a className={pathname === '/' ? 'is-active' : ''}>Home</a>
      </Link>
      <Link href="/apollo">
        <a className={pathname === '/apollo' ? 'is-active' : ''}>Apollo</a>
      </Link>
      <Link href="/redux">
        <a className={pathname === '/redux' ? 'is-active' : ''}>Redux</a>
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
