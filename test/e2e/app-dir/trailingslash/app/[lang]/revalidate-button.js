'use client'

import { useState, useTransition } from 'react'

export function RevalidateButton({ lang }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)

  function handleRevalidate() {
    startTransition(async () => {
      setResult(null)
      try {
        const res = await fetch(`/api/revalidate/?lang=${lang}`)
        const data = await res.json()
        setResult(`Revalidated at: ${data.timestamp}`)
      } catch (e) {
        setResult(`Error: ${e}`)
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
      <pre id="revalidate-result">{result}</pre>
    </div>
  )
}
