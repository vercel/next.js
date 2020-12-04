import Link from 'next/link'

export default function Links() {
  return (
    <>
      <p id="links">Links</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
      <br />

      <Link href="/about">
        <a id="to-about">to /about</a>
      </Link>
      <br />

      <Link href="/catch-all/hello">
        <a id="to-catch-all">to /catch-all/hello</a>
      </Link>
      <br />

      <Link href="/links">
        <a id="to-links">to /links</a>
      </Link>
    </>
  )
}
