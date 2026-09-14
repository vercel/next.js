import * as React from 'react'

export default async function SearchPage({ searchParams }) {
  const { query, text } = await searchParams
  await sleep(1000)
  return (
    <div id="search-results">
      query: {JSON.stringify(query)}
      <br />
      text: {JSON.stringify(text)}
    </div>
  )
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms))
}
