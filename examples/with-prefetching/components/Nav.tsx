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
      <Link href="/" legacyBehavior>
        <a>Home</a>
      </Link>{' '}
      <Link href="/features" legacyBehavior>
        <a>Features</a>
      </Link>
      <h2>Imperative</h2>
      <p>Prefetch on onMouseEnter or on other events:</p>
      <Link prefetch={false} href="/about" legacyBehavior>
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
      <Link prefetch={false} href="/contact" legacyBehavior>
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
