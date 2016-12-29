import Link, { prefetch } from 'next/prefetch'
import RegularLink from 'next/link'

export default () => (
  <div>
    { /* Prefetch using the declarative API */ }
    <Link href='/'>
      <a>Home</a>
    </Link>

    <Link href='/features'>
      <a>Features</a>
    </Link>

    { /* we imperatively prefetch on hover */ }
    <RegularLink href='/about'>
      <a onMouseEnter={() => { prefetch('/about'); console.log('prefetching /about!') }}>About</a>
    </RegularLink>

    <Link href='/contact' prefetch={false}>
      <a>Contact (<small>NO-PREFETCHING</small>)</a>
    </Link>

    <style jsx>{`
      a {
        margin-right: 10px;
      }
    `}</style>
  </div>
)
