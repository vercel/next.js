import Link from 'next/link'

export default function Page() {
  return (
    <>
      <div>
        <Link href="/catch-all/this/is/a/test">
          <a id="to-catch-all">To catch-all</a>
        </Link>
      </div>
      <div>
        <Link href="/catch-all-optional/this/is/a/test">
          <a id="to-catch-all-optional">To optional catch-all</a>
        </Link>
      </div>
    </>
  )
}
