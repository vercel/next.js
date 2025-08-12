import { Suspense } from 'react'
import { SearchParamsDisplay } from './client'

export default function TargetPage() {
  return (
    <div>
      <h1>Target Page</h1>
      <p id="static-content">Static content</p>
      <Suspense
        fallback={
          <div id="search-params-loading">Loading search params...</div>
        }
      >
        <SearchParamsDisplay />
      </Suspense>
    </div>
  )
}
