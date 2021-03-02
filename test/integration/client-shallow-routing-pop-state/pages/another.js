import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="text">another</p>
      <br />
      <Link href="/first">
        <a id="to-first">to /first</a>
      </Link>
      <Link href="/1/dynamic">
        <a id="to-dynamic">to /dynamic</a>
      </Link>
    </>
  )
}
