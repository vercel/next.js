import Link from 'next/link'

export default function Home() {
  return (
    <div>
      Hello World.{' '}
      <Link href="/about">
        <a>About</a>
      </Link>
      <Link href="/ssr">
        <a>SSR</a>
      </Link>
      <Link href="/ssg">
        <a>SSG</a>
      </Link>
    </div>
  )
}
