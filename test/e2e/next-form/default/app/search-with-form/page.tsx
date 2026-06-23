import * as React from 'react'
import Form from 'next/form'

export default async function SearchWithFormPage({ searchParams }) {
  const query = (await searchParams).query as string | undefined
  await sleep(100)
  return (
    <div>
      <Form action="/search-with-form" id="search-form">
        <input name="query" defaultValue={query ?? ''} />
        <button type="submit">Search</button>
      </Form>
      {query !== undefined && (
        <div id="search-results">query: {JSON.stringify(query)}</div>
      )}
    </div>
  )
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms))
}
