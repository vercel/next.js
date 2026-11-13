import { cacheLife } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { Suspense, type ReactNode } from 'react'

async function getGeneration() {
  'use cache'
  cacheLife('minutes')
  return randomUUID()
}

async function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <p id="generation">{await getGeneration()}</p>
      {children}
    </>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  )
}
