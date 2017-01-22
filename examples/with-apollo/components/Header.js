import Link from 'next/prefetch'

export default ({ pathname }) => (
  <header>
    <Link href='/'>
      <a className={pathname === '/' && 'is-active'}>Home</a>
    </Link>

    <Link href='/about'>
      <a className={pathname === '/about' && 'is-active'}>About</a>
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
