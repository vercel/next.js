import React, { Suspense } from 'react'

async function Inner({ children }) {
  await new Promise((resolve) => setTimeout(resolve, 1 * 1000))
  return (
    <div className="inner">
      <Suspense>{children}</Suspense>
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Inner>{children}</Inner>
    </Suspense>
  )
}
