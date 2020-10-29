import Link from 'next/link'

export default function Home() {
  return (
    <div>
      Hello World.{' '}
      <ul>
        <li>
          <Link href="/about">
            <a>About</a>
          </Link>
        </li>
        <li>
          <Link href="/ssr">
            <a>SSR</a>
          </Link>
        </li>
        <li>
          <Link href="/ssg">
            <a>SSG</a>
          </Link>
        </li>
      </ul>
    </div>
  )
}
