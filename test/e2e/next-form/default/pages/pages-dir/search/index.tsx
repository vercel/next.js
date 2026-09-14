import * as React from 'react'

export async function getServerSideProps({ req }) {
  await sleep(1000)
  return {
    props: {
      searchParams: Object.fromEntries(
        new URL(req.url, 'http://n').searchParams.entries()
      ),
    },
  }
}

export default function SearchPage({ searchParams }) {
  const { query, text } = searchParams
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
