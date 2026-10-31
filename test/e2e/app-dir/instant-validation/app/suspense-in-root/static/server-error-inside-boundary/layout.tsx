import { type ReactNode } from 'react'
import { connection } from 'next/server'

export const instant = false

function ServerError() {
  throw new Error('Server component error inside boundary')
}

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <>
      <p>
        This layout renders a server component that throws without a Suspense
        boundary. The error is inside the validation boundary so it prevents
        validation from completing.
      </p>
      <ServerError />
      {children}
    </>
  )
}
