'use client'

import _ from 'lodash'
import { useMemo, useState } from 'react'

const ARTICLES = [
  'Resetting your password',
  'Updating billing details',
  'Exporting order history',
  'Inviting teammates',
  'Closing your account',
]

export function DocsSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(ARTICLES)

  const search = useMemo(
    () =>
      _.debounce((value: string) => {
        const needle = value.toLowerCase()
        setResults(
          ARTICLES.filter((article) => article.toLowerCase().includes(needle))
        )
      }, 150),
    []
  )

  return (
    <section aria-label="Search docs">
      <input
        value={query}
        placeholder="Search docs"
        onChange={(event) => {
          setQuery(event.target.value)
          search(event.target.value)
        }}
      />
      <ul>
        {results.map((article) => (
          <li key={article}>{article}</li>
        ))}
      </ul>
    </section>
  )
}
