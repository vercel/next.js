import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 id="home">Home</h1>
      <Link href="/other">Other</Link>
    </div>
  )
}
