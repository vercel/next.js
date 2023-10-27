import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="blog">blog page</p>
      <Link href="/with-app-dir" id="to-index">
        to index
      </Link>
      <br />
    </>
  )
}
