import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Modal</h1>
      <ul>
        <li>
          <Link href="/u/foobar/l">Profile Link</Link>
        </li>
        <li>
          <Link href="/trending">Trending Link</Link>
        </li>
      </ul>
    </div>
  )
}
