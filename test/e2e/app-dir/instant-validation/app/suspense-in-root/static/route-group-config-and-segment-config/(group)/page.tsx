import { cookies } from 'next/headers'

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>This page awaits cookies() without Suspense</p>
    </main>
  )
}
