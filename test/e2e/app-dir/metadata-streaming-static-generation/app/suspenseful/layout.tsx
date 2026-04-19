import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <div className="suspenseful-layout">
      <Suspense>{children}</Suspense>
    </div>
  )
}
