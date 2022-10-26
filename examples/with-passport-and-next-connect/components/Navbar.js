import Link from 'next/link'
import { useUser } from '../lib/hooks'

export default function Navbar() {
  const [user, { mutate }] = useUser()

  async function handleLogout() {
    await fetch('/api/logout')
    mutate({ user: null })
  }

  return (
    <header>
      <nav>
        <ul>
          <li>
            <Link href="/" legacyBehavior>
              Home
            </Link>
          </li>
          {user ? (
            <>
              <li>
                <Link href="/profile" legacyBehavior>
                  Profile
                </Link>
              </li>
              <li>
                <a role="button" onClick={handleLogout}>
                  Logout
                </a>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link href="/signup" legacyBehavior>
                  Sign up
                </Link>
              </li>
              <li>
                <Link href="/login" legacyBehavior>
                  Login
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
      <style jsx>{`
        nav {
          max-width: 42rem;
          margin: 0 auto;
          padding: 0.2rem 1.25rem;
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
        li:first-child {
          margin-left: auto;
        }
        a {
          color: #fff;
          text-decoration: none;
          cursor: pointer;
        }
        header {
          color: #fff;
          background-color: #666;
        }
      `}</style>
    </header>
  )
}
