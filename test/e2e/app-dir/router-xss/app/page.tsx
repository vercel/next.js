'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <ul>
      <li>
        <Link
          id="untrusted-client-side-navigation"
          href="javascript:console.log('XSS untrusted client-side navigation');"
        >
          untrusted client-side navigation
        </Link>
      </li>
      <li>
        <Link
          id="untrusted-client-side-navigation-with-as"
          href="/about"
          as="javascript:console.log('XSS untrusted client-side navigation with as');"
        >
          untrusted client-side navigation with as
        </Link>
      </li>
      <li>
        <button
          id="untrusted-push"
          onClick={() => {
            router.push("javascript:console.log('XSS untrusted push');")
          }}
        >
          untrusted push
        </button>
      </li>
      <li>
        <button
          id="trusted-push"
          onClick={() => {
            router.push({
              unsafeHref: {
                __href: "javascript:console.log('XSS trusted push');",
              },
            })
          }}
        >
          trusted push
        </button>
      </li>
    </ul>
  )
}
