import Link from 'next/link'

export default function DashPage() {
  return (
    <main>
      <h1>dash</h1>
      <p>
        <Link href="/dash/settings" id="link-dash-settings">
          settings
        </Link>
      </p>
    </main>
  )
}
