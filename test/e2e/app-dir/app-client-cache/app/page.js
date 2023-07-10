import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <div>
        <Link href="/0?timeout=0" prefetch={true}>
          To Random Number - prefetch: true
        </Link>
      </div>
      <div>
        <Link href="/1">To Random Number - prefetch: auto</Link>
      </div>
      <div>
        <Link href="/2" prefetch={false}>
          To Random Number 2 - prefetch: false
        </Link>
      </div>
      <div>
        <Link href="/1?timeout=1000">
          To Random Number - prefetch: auto, slow
        </Link>
      </div>
    </>
  )
}
