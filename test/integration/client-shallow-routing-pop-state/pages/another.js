import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="text">another</p>
      <br />
      <Link href="/first">
        <a id="to-first">to /first</a>
      </Link>
    </>
  )
}
