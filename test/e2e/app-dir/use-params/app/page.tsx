import Link from 'next/link'

export default function Page() {
  return (
    <>
      <div>
        <Link href="/a" id="to-a">
          To /a
        </Link>
      </div>
      <div>
        <Link href="/a/b" id="to-a-b">
          To /a/b
        </Link>
      </div>
    </>
  )
}
