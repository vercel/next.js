import Link from 'next/link'

export default function IndexPage() {
  return (
    <div>
      Hello World.{' '}
      <ul>
        <li>
          <Link href="/about">About</Link>
        </li>
        <li>
          <Link href="/ssr">SSR</Link>
        </li>
        <li>
          <Link href="/ssg">SSG</Link>
        </li>
      </ul>
    </div>
  )
}
