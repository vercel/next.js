import { connection } from 'next/server'
import { ReactNode } from 'react'

export const unstable_instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <>
      <div>This layout blocks the children</div>
      <hr />
      {children}
    </>
  )
}
