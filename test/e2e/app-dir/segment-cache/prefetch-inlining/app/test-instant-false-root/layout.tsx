import { ReactNode } from 'react'
import { connection } from 'next/server'

export const unstable_instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return <div>{children}</div>
}
