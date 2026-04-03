import Link from 'next/link'

export default function Group1Home() {
  return (
    <div>
      <h1>Group 1 Home</h1>
      <Link href="/shared" id="group1-link">
        Go to shared
      </Link>
    </div>
  )
}
