import * as React from 'react'

export default async function RedirectedPage({ searchParams }) {
  const query = (await searchParams).query as string
  return <div id="redirected-results">query: {JSON.stringify(query)}</div>
}
