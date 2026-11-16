import { useState } from 'react'
import type { GetServerSideProps } from 'next'

export default function Page({ query }: { query: Record<string, unknown> }) {
  const [count, setCount] = useState(0)
  return (
    <main>
      <h1 id="destination">custom server destination</h1>
      <p id="query">{JSON.stringify(query)}</p>
      <button id="counter" onClick={() => setCount(count + 1)}>
        {count}
      </button>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  props: { query },
})
