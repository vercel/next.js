import { Suspense, type ReactNode } from 'react'

export default function Layout({
  children,
  modal,
}: {
  children: ReactNode
  modal: ReactNode
}) {
  return (
    <>
      {children}
      <Suspense fallback={<p>Loading slot</p>}>{modal}</Suspense>
    </>
  )
}
