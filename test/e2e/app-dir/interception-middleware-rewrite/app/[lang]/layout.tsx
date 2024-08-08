import Link from 'next/link'

export default function Layout({ children, modal, params }) {
  return (
    <>
      <div>
        <Link href="/feed">feed</Link>
      </div>
      <div>
        Photos: <Link href="/photos/1">Photo 1</Link>{' '}
        <Link href="/photos/2">Photo 2</Link>
      </div>
      <div>{params.lang}</div>
      <div id="children">{children}</div>
      <div id="modal">{modal}</div>
    </>
  )
}
