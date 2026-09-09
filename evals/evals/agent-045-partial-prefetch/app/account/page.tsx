import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function Balance() {
  const session = (await cookies()).get('session')?.value ?? 'anonymous'
  // Simulate fetching the balance for this session.
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <p id="balance">Balance for {session}: $1,234.56</p>
}

export default function AccountPage() {
  return (
    <main>
      <h1>Your account</h1>
      <Suspense fallback={<p>Loading balance…</p>}>
        <Balance />
      </Suspense>
    </main>
  )
}
