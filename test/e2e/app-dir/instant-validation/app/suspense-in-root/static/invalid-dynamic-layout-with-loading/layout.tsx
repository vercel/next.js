import { connection } from 'next/server'
import { ReactNode } from 'react'

export const unstable_instant = true

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <div>
        <p>
          This layout has a dynamic hole without a suspense. There's a
          loading.js at this level, but loading.js goes below the layout, so
          this should fail validation.
        </p>
        <Dynamic />
      </div>
      <hr />
      {children}
    </>
  )
}

async function Dynamic() {
  await connection()
  return 'Dynamic content from layout'
}
