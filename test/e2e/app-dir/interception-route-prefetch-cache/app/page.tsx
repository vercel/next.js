import Link from 'next/link'

export default function Home() {
  return (
    <ul>
      <li>
        <Link href="/foo">foo</Link>
      </li>
      <li>
        <Link href="/bar">bar</Link>
      </li>
      <br />
      <li>
        <Link href="/post/1">post 1</Link>
      </li>
    </ul>
  )
}
