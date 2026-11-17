import { connection } from 'next/server'
import { Suspense } from 'react'

async function Dynamic() {
  await connection()
  return null
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <Dynamic />
      </Suspense>
      {children}
    </>
  )
}
