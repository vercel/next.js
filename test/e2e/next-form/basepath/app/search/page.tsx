import * as React from 'react'

export default async function SearchPage({ searchParams }) {
  const query = (await searchParams).query as string
  await sleep(1000)
  return <div id="search-results">query: {JSON.stringify(query)}</div>
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms))
}
