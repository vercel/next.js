import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Invoices your customers actually pay</h1>
      <p>Ledger sends, tracks and reconciles invoices for small teams.</p>
      <Link href="/login">Sign in</Link>
    </main>
  )
}
