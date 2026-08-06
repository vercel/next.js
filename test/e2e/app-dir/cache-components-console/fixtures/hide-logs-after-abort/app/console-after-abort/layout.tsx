import { Suspense } from 'react'

export default async function layout({ children }) {
  return <Suspense>{children}</Suspense>
}
