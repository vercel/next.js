import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <>
      <p>This layout wraps the children in Suspense.</p>
      <hr />
      <Suspense fallback={<div>Fallback from layout...</div>}>
        {children}
      </Suspense>
    </>
  )
}
