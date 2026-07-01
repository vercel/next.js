import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <Link href="/staff" data-testid="go-staff">
        Go to staff
      </Link>
    </main>
  )
}
