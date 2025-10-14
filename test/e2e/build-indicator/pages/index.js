import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/a" id="to-a">
        Go to a
      </Link>
      <Link href="/b" id="to-b">
        Go to b
      </Link>
    </>
  )
}
