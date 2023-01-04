import Link from 'next/link'

export default function Index() {
  return (
    <>
      <p id="index">index</p>
      <Link href="/gsp" id="to-gsp">
        to gsp
      </Link>
      <br />
      <Link href="/gssp" id="to-gssp">
        to gssp
      </Link>
      <br />
      <Link href="/non-existent" id="to-404">
        to non-existent
      </Link>
      <br />
    </>
  )
}
