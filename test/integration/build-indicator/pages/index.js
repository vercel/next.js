import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/a">
        <a id="to-a">Go to a</a>
      </Link>
      <Link href="/b">
        <a id="to-b">Go to b</a>
      </Link>
    </>
  )
}
