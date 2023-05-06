import Link from 'next/link'

const Layout = ({ children }) => (
  <>
    <nav>
      <Link href="/" legacyBehavior>
        <a>home</a>
      </Link>
      <Link href="/blog" legacyBehavior>
        <a>blog</a>
      </Link>
      <Link href="/about" legacyBehavior>
        <a>about</a>
      </Link>
    </nav>
    <main>{children}</main>
    <style jsx>{`
      nav {
        text-align: center;
      }
      nav a {
        margin-right: 2px;
        padding: 4px;
      }
      main {
        display: flex;
        flex-direction: column;
      }
    `}</style>
  </>
)

export default Layout
