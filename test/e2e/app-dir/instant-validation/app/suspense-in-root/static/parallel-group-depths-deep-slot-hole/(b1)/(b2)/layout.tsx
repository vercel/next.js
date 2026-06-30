import { connection } from 'next/server'
import { ReactNode } from 'react'

export default async function B2Layout({ children }: { children: ReactNode }) {
  await connection()
  return <div>{children}</div>
}
