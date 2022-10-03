import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="another">another page</p>
      <Link href="/">
        <a id="to-index">to index</a>
      </Link>
      <br />
    </>
  )
}
