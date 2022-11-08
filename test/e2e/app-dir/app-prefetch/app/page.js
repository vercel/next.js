import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <Link href="/dashboard" id="to-dashboard">
        To Dashboard
      </Link>
    </>
  )
}
