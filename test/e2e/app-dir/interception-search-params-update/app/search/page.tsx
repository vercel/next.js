'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const isUpdatingRef = useRef(false)

  useEffect(() => {
    // Sync query from URL params when they change externally
    const urlQuery = searchParams.get('q') || ''
    if (urlQuery !== query && !isUpdatingRef.current) {
      setQuery(urlQuery)
    }
  }, [searchParams, query])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    isUpdatingRef.current = true

    // Update URL when query changes
    const params = new URLSearchParams(searchParams.toString())
    if (newQuery) {
      params.set('q', newQuery)
    } else {
      params.delete('q')
    }
    router.replace(`/search?${params.toString()}`)

    // Reset flag after a short delay
    setTimeout(() => {
      isUpdatingRef.current = false
    }, 100)
  }

  return (
    <div id="search-page">
      <h1>Search Page (Not Intercepted)</h1>
      <Link href="/">Back to Home</Link>
      <input
        id="search-input"
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder="Search..."
      />
      <p id="search-query">Query: {query || '(empty)'}</p>
    </div>
  )
}
