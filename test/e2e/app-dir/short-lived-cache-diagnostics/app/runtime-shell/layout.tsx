import { cookies } from 'next/headers'
import { Suspense } from 'react'
async function Session() {
  await cookies()
  return <p>Session</p>
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<p>Loading session</p>}>
        <Session />
      </Suspense>
      {children}
    </>
  )
}
