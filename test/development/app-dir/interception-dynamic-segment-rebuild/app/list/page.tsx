import Link from 'next/link'

export default function ListPage() {
  return (
    <>
      <h1 id="list-title">List</h1>
      <Link href="/list/1" id="link-1">
        Open item 1
      </Link>
      <Link href="/user-next-url-rewrite" id="link-next-url-rewrite">
        Open Next-Url rewrite
      </Link>
    </>
  )
}
