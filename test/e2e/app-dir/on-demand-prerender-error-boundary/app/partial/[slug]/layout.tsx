import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'
import { headers } from 'next/headers'

async function RequestContent() {
  await connection()
  const language = (await headers()).get('accept-language')
  return <p id="request-content">{language}</p>
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <p>Static layout</p>
      <Suspense fallback={<p>Waiting for request</p>}>
        <RequestContent />
      </Suspense>
      {children}
    </>
  )
}
