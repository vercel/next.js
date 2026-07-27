import Link from 'next/link'

export default function Links() {
  return (
    <>
      <p id="links">Links</p>
      <Link href="/" id="to-index">
        to /
      </Link>
      <br />

      <Link href="/about" id="to-about">
        to /about
      </Link>
      <br />

      <Link href="/catch-all/hello" id="to-catch-all">
        to /catch-all/hello
      </Link>
      <br />

      <Link href="/links" id="to-links">
        to /links
      </Link>
    </>
  )
}
