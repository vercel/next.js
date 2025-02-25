import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <div data-date={Number(new Date())}>
      <h2>Suspenseful Layout</h2>
      <Suspense>{children}</Suspense>
    </div>
  )
}
