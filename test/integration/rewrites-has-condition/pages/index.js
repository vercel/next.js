import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="index">index page</p>
      <Link href="/rewrite-simple" id="to-simple">
        to /rewrite-simple
      </Link>
      <br />

      <Link href="/rewrite-with-has?hasQuery=true" id="to-has-rewrite">
        to /rewrite-with-has?hasQuery=true
      </Link>
      <br />
    </>
  )
}
