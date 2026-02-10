import { cookies } from 'next/headers'
import { ReactNode } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default async function Layout({ children }: { children: ReactNode }) {
  await cookies()
  return (
    <div>
      <p>
        This is a layout that uses runtime data without a suspense, so it should
        error the static prefetch assertion
      </p>
      <hr />
      {children}
    </div>
  )
}
