import * as React from 'react'

export default function RedirectedPage({ searchParams }) {
  const query = searchParams.query as string
  return <div id="redirected-results">query: {JSON.stringify(query)}</div>
}
