import Router from 'next/router'
import Link from 'next/link'

export default () => (
  <div>
    {/* Prefetch using the declarative API */}
    <Link prefetch href='/'>
      <a>Home</a>
    </Link>

    <Link prefetch href='/features'>
      <a>Features</a>
    </Link>

    {/* we imperatively prefetch on hover */}
    <Link href='/about'>
      <a
        onMouseEnter={() => {
          Router.prefetch('/about')
          console.log('prefetching /about!')
        }}
      >
        About
      </a>
    </Link>

    <Link href='/contact'>
      <a>
        Contact (<small>NO-PREFETCHING</small>)
      </a>
    </Link>

    <style jsx>{`
      a {
        margin-right: 10px;
      }
    `}</style>
  </div>
)
