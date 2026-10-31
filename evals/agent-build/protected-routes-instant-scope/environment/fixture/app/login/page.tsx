import Link from 'next/link'

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to Ledger</h1>
      <p>Pick a workspace to continue.</p>
      <ul>
        <li>
          <Link href="/login/as?user=ada">
            Continue as Ada (Analytical Engines)
          </Link>
        </li>
        <li>
          <Link href="/login/as?user=alan">Continue as Alan (Bletchley)</Link>
        </li>
      </ul>
    </main>
  )
}
