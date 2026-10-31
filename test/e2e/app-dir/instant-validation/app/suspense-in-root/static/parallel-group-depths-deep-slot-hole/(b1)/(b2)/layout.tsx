import { cookies } from 'next/headers'
import { ReactNode } from 'react'

export default async function B2Layout({ children }: { children: ReactNode }) {
  await cookies()
  return <div>{children}</div>
}
