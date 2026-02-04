import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/app/a" id="to-a">
        Go to a
      </Link>
      <Link href="/app/b" id="to-b">
        Go to b
      </Link>
    </>
  )
}
