import Link from 'next/link'

export default function Page() {
  return (
    <>
      <div>
        <Link href="/without-loading/0?timeout=0" prefetch={true}>
          To Random Number - prefetch: true
        </Link>
      </div>
      <div>
        <Link href="/without-loading/0?timeout=1000" prefetch={true}>
          To Random Number - prefetch: true, slow
        </Link>
      </div>
      <div>
        <Link href="/without-loading/1">To Random Number - prefetch: auto</Link>
      </div>
      <div>
        <Link href="/without-loading/2" prefetch={false}>
          To Random Number 2 - prefetch: false
        </Link>
      </div>
      <div>
        <Link href="/without-loading/2?timeout=1000" prefetch={false}>
          To Random Number 2 - prefetch: false, slow
        </Link>
      </div>
      <div>
        <Link href="/without-loading/1?timeout=1000">
          To Random Number - prefetch: auto, slow
        </Link>
      </div>
    </>
  )
}
