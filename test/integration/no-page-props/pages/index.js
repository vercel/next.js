import Link from 'next/link'

export default function Index() {
  return (
    <>
      <p id="index">index</p>
      <Link href="/gsp">
        <a id="to-gsp">to gsp</a>
      </Link>
      <br />
      <Link href="/gssp">
        <a id="to-gssp">to gssp</a>
      </Link>
      <br />
      <Link href="/non-existent">
        <a id="to-404">to non-existent</a>
      </Link>
      <br />
    </>
  )
}
