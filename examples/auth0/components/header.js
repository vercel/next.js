import Link from 'next/link'
import { AuthContext } from '../lib/authProvider'
import { useContext } from 'react'

function Header({ SSRUser }) {
  let { user } = useContext(AuthContext)
  if (SSRUser) {
    user = SSRUser
  }

  const AuthHeader = () => (
    <>
      <li>
        <Link href="/profile">
          <a>Client-rendered profile</a>
        </Link>
      </li>
      <li>
        <Link href="/advanced/ssr-profile">
          <a>Server rendered profile (advanced)</a>
        </Link>
      </li>
      <li>
        <a href="/api/logout">Logout</a>
      </li>
    </>
  )

  const UnAuthHeader = () => (
    <>
      <>
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
      </>
      <li>
        <a href="/api/login">Login</a>
      </li>
    </>
  )

  return (
    <header>
      <nav>
        <ul>{user ? <AuthHeader /> : <UnAuthHeader />}</ul>
      </nav>

      <style jsx global>{`
        header {
          padding: 0.2rem;
          color: #fff;
          background-color: #333;
        }
        nav {
          max-width: 42rem;
          margin: 1.5rem auto;
        }
        ul {
          display: flex;
          list-style: none;
          margin-left: 0;
          padding-left: 0;
        }
        li {
          margin-right: 1rem;
        }
        li:nth-child(2) {
          margin-right: auto;
        }
        a {
          color: #fff;
          text-decoration: none;
        }
        button {
          font-size: 1rem;
          color: #fff;
          cursor: pointer;
          border: none;
          background: none;
        }
      `}</style>
    </header>
  )
}

export default Header
