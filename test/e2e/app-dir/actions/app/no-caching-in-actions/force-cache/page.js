'use client'
import { useState, useTransition } from 'react'
import { getNumber } from './actions'

export default function Page() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)
  return (
    <>
      <h1>No Caching in Actions: {isPending ? 'pending' : 'not pending'}</h1>
      {result !== null ? (
        <pre id="fetched-data">{JSON.stringify(result)}</pre>
      ) : null}
      <button
        id="trigger-fetch"
        onClick={() =>
          startTransition(async () => {
            const result = await getNumber()
            setResult(result)
          })
        }
      >
        Trigger fetch
      </button>
    </>
  )
}
