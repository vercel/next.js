'use client'

import { useState, useTransition } from 'react'

export function RevalidateButton({ lang }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)

  function handleRevalidate() {
    startTransition(async () => {
      try {
        const data = await fetch(`/api/revalidate/?lang=${lang}`).then((res) =>
          res.json()
        )
        startTransition(() => {
          setResult(`Revalidated at: ${data.timestamp}`)
        })
      } catch (e) {
        startTransition(() => {
          setResult(`Error: ${e}`)
        })
      }
    })
  }

  return (
    <div>
      <button
        onClick={handleRevalidate}
        disabled={isPending}
        id="revalidate-button"
      >
        {isPending ? 'Revalidating...' : `Revalidate /${lang}/`}
      </button>
      {result && <pre id="revalidate-result">{result}</pre>}
    </div>
  )
}
