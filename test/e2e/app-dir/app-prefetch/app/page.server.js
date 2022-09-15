import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <Link href="/dashboard">
        <a id="to-dashboard">To Dashboard</a>
      </Link>
    </>
  )
}
