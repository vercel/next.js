import { Suspense } from 'react'

export default async function Layout({ children, slot }) {
  return (
    <>
      <section>
        <h1>slot</h1>
        <Suspense fallback="loading slot...">{slot}</Suspense>
      </section>
      <section>
        <h1>children</h1>
        <Suspense fallback="loading children...">{children}</Suspense>
      </section>
    </>
  )
}
