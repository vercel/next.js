import { connection } from 'next/server'
import { ReactNode } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <div>
      <p>
        This is a layout that uses dynamic data without a suspense, so it should
        error the runtime prefetch assertion
      </p>
      <hr />
      {children}
    </div>
  )
}
