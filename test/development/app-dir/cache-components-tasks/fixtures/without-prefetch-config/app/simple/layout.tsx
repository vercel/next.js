import { Suspense } from 'react'
import { Static, Runtime, Dynamic } from '../shared'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div>
        <Static label="layout" />
        <Suspense fallback="Loading...">
          <Runtime label="layout" />
        </Suspense>
        <Suspense fallback="Loading...">
          <Dynamic label="layout" />
        </Suspense>
      </div>
      <hr />
      {children}
    </>
  )
}
