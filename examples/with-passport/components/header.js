import Link from 'next/link'

const Header = () => (
  <header>
    <nav>
      <ul>
        <li>
          <Link href="/">
            <a>Home</a>
          </Link>
        </li>
        <li>
          <Link href="/login">
            <a>Login</a>
          </Link>
        </li>
        <li>
          <Link href="/profile">
            <a>Profile</a>
          </Link>
        </li>
        <li>
          <button>Logout</button>
        </li>
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
      }
      header {
        color: #fff;
        background-color: #333;
      }
      button {
        color: #fff;
        font-size: 1rem;
        font-family: inherit;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
      }
    `}</style>
  </header>
)

export default Header
