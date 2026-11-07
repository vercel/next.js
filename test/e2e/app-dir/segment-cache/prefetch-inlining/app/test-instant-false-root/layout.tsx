import { ReactNode } from 'react'
import { connection } from 'next/server'

export const instant = false
export const prefetch = 'force-disabled'

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return <div>{children}</div>
}
