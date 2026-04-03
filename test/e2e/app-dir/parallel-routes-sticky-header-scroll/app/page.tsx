import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link href="/page-a" id="link-to-a">
        Go to Page A
      </Link>
    </div>
  )
}
