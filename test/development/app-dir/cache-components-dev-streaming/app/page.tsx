import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/use-cache">/use-cache</Link>
      </li>
      <li>
        <Link href="/runtime-prefetch">/runtime-prefetch</Link>
      </li>
      <li>
        <Link href="/use-cache-private-runtime-prefetch">
          /use-cache-private-runtime-prefetch
        </Link>
      </li>
      <li>
        <Link href="/use-cache-expire-zero/nav">
          /use-cache-expire-zero/nav
        </Link>
      </li>
      <li>
        <Link href="/partial-prefetching/session-data">
          /partial-prefetching/session-data
        </Link>
      </li>
      <li>
        <Link href="/partial-prefetching/link-data?prefetch=auto">
          /partial-prefetching/link-data
        </Link>
      </li>
    </ul>
  )
}
