import React from 'react'

export default function InterceptedSearchPage() {
  return (
    <div id="intercepted-search-page">
      <h1>Intercepted Search Page</h1>
      <p>
        This should only appear when navigating TO /search, not when updating
        search params on /search
      </p>
    </div>
  )
}
