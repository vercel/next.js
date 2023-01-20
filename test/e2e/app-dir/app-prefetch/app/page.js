import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <Link href="/dashboard" id="to-dashboard">
        To Dashboard
      </Link>
      <Link href="/static-page" id="to-static-page">
        To Static Page
      </Link>
    </>
  )
}
