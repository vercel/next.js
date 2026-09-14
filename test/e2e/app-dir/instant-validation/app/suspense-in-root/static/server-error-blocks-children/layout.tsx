import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'

export const instant = false

function ServerError() {
  throw new Error('Server component error')
}

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <>
      <p>
        This layout renders a server component that throws. The error is caught
        by a Suspense boundary but wraps the children slot, preventing the
        instant page from rendering.
      </p>
      <Suspense>
        <ServerError />
        {children}
      </Suspense>
    </>
  )
}
