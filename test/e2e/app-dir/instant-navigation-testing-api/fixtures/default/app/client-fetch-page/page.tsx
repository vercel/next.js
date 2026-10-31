'use client'

import { useState, useEffect } from 'react'

export default function ClientFetchPage() {
  const [data, setData] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/data')
      .then((res) => res.json())
      .then((json) => setData(json.message))
  }, [])

  return (
    <div>
      <h1 data-testid="client-fetch-title">Client Fetch Page</h1>
      {data ? (
        <div data-testid="fetched-data">{data}</div>
      ) : (
        <div data-testid="fetched-data-loading">Loading data...</div>
      )}
    </div>
  )
}
