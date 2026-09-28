import { Suspense } from 'react'

export default function SuspenseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Suspense>{children}</Suspense>
}
