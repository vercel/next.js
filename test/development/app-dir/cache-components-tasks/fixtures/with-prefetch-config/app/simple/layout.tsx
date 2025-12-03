import { Suspense } from 'react'
import { Static, Runtime, Dynamic } from '../shared'

export const unstable_prefetch = { mode: 'runtime', samples: [{}] }

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
