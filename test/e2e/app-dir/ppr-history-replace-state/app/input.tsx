'use client'

import * as React from 'react'

export function Input() {
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    if (!query) {
      return
    }

    window.history.replaceState({ query }, null, `?q=${query}`)
  }, [query])

  return (
    <input
      onChange={(event) => setQuery(event.currentTarget.value)}
      value={query}
    />
  )
}
