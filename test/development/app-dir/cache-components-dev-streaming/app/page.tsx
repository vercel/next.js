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
    </ul>
  )
}
