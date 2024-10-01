import * as React from 'react'
import { setTimeout } from 'timers/promises'

export async function getServerSideProps({ req }) {
  await setTimeout(1000)
  return {
    props: {
      searchParams: Object.fromEntries(
        new URL(req.url, 'http://n').searchParams.entries()
      ),
    },
  }
}

export default function RedirectedPage({ searchParams }) {
  const query = searchParams.query as string
  return <div id="redirected-results">query: {JSON.stringify(query)}</div>
}
