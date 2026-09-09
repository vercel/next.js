import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Acme Bank</h1>
      <nav>
        <Link prefetch={true} href="/account">
          Account
        </Link>
      </nav>
      <p>Welcome back.</p>
    </main>
  )
}
