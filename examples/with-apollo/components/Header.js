import Link from 'next/prefetch'

export default (props) => (
  <header>
    <Link href='/'>
      <a className={props.pathname === '/' && 'is-active'}>Home</a>
    </Link>

    <Link href='/about'>
      <a className={props.pathname === '/about' && 'is-active'}>About</a>
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
