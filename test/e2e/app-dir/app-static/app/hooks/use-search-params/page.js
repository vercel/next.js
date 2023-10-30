import UseSearchParams from './search-params'
import React from 'react'

export default function Page() {
  return (
    <>
      <p id="hooks-use-search-params" />
      <React.Suspense fallback="loading">
        <UseSearchParams />
      </React.Suspense>
    </>
  )
}
