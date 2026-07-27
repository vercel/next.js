import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link href="/fake-link">Go to Invalid Page</Link>
    </div>
  )
}
