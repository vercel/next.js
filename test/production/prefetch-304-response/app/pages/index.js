import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/ssg" id="to-ssg">
        Go to SSG page
      </Link>
    </div>
  )
}
