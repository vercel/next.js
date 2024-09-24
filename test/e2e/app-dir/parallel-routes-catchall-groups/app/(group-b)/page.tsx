import Link from 'next/link'

export default function Home() {
  return (
    <div>
      Home
      <div>
        <Link href="/foo">To /foo </Link>
      </div>
      <div>
        <Link href="/bar">To /bar</Link>
      </div>
    </div>
  )
}
