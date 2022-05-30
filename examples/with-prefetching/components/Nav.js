import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Nav() {
  const router = useRouter()
  return (
    <div className="root">
      <h2>Default</h2>
      <p>
        Automatically prefetch pages in the background as soon the Link appears
        in the view:
      </p>
      <Link href="/">
        <a>Home</a>
      </Link>
      <h2>Hover only</h2>
      <p>Prefetch only onMouseEnter:</p>
      <Link prefetch={false} href="/features">
        <a>Features</a>
      </Link>
      <h2>Imperative</h2>
      <p>Prefetch on onMouseEnter or on other events with router.prefetch:</p>
      <Link prefetch={false} prefetchOnHover={false} href="/about">
        <a
          onMouseEnter={() => {
            router.prefetch('/about')
            console.log('prefetching /about!')
          }}
        >
          About
        </a>
      </Link>
      <h2>Disable</h2>
      <p>Disable prefetching</p>
      <Link prefetch={false} prefetchOnHover={false} href="/contact">
        <a>Contact</a>
      </Link>
      <style jsx>{`
        .root {
          border-bottom: 1px solid grey;
          padding-bottom: 8px;
        }
        a {
          margin-right: 10px;
        }
      `}</style>
    </div>
  )
}
